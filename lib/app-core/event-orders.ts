import "server-only";

import { cache } from "react";
import { inStoreWriteMode, isMissingInStoreTable, isPreviewPilotSale, previewPilotAdminForGuestClaim } from "@/lib/app-core/in-store";
import { appCoreDb } from "@/lib/app-core/service";

type OrderRow = { id: string; auth_user_id: string | null; status: string; total_pence: number; currency: string; created_at: string; refund_status: string; refunded_total_pence: number };
type LineRow = { id: string; order_id: string; item_type: string; item_name: string; quantity: number; unit_amount_pence: number; ticket_type_id: string | null; refunded_quantity: number; refunded_amount_pence: number };
type BookingRow = { id: string; order_line_id: string; event_id: string; ticket_type_id: string; auth_user_id: string | null; quantity: number; status: string; created_at: string };
type EventRow = { id: string; slug: string; title: string; series_name: string | null; starts_at: string };
type TicketRow = { id: string; name: string };
type CustomerRow = { auth_user_id: string; email: string; display_name: string | null };

export type EventOrder = OrderRow & {
  sumupSaleDate: string | null;
  lines: Array<LineRow & { booking?: BookingRow; event?: EventRow; ticket?: TicketRow }>;
};

async function loadEventOrders(authUserId?: string) {
  const db = appCoreDb();
  let query = db
    .from("orders")
    .select("id, auth_user_id, status, total_pence, currency, created_at, refund_status, refunded_total_pence")
    .in("status", ["paid", "partially_refunded", "refunded"]);
  if (authUserId) query = query.eq("auth_user_id", authUserId);
  const { data: orders, error } = await query.order("created_at", { ascending: false }).limit(2000);
  if (error) throw new Error("Could not load event orders");

  const typedOrders = (orders ?? []) as OrderRow[];
  const orderIds = typedOrders.map((order) => order.id);
  if (!orderIds.length) return { orders: [] as EventOrder[], customers: new Map<string, CustomerRow>() };

  // Keep URL-encoded UUID lists well below gateway/request-size limits.
  // Fail closed on any batch error to avoid displaying partial financial totals.
  const lookupBatchSize = 100;
  const typedLines: LineRow[] = [];
  for (let start = 0; start < orderIds.length; start += lookupBatchSize) {
    const batchIds = orderIds.slice(start, start + lookupBatchSize);
    const { data, error: linesError } = await db
      .from("order_lines")
      .select("id, order_id, item_type, item_name, quantity, unit_amount_pence, ticket_type_id, refunded_quantity, refunded_amount_pence")
      .in("order_id", batchIds)
      .eq("item_type", "event_ticket");
    if (linesError) {
      console.error("[event-orders] Order-line batch failed", {
        code: linesError.code,
        batch: Math.floor(start / lookupBatchSize) + 1,
      });
      throw new Error("Could not load event order lines");
    }
    typedLines.push(...((data ?? []) as LineRow[]));
  }
  const eventOrderIds = new Set(typedLines.map((line) => line.order_id));
  const eventOrders = typedOrders.filter((order) => eventOrderIds.has(order.id));
  const lineIds = typedLines.map((line) => line.id);

  // A single .in() URL can exceed the PostgREST request limit as sales grow.
  // Bound each request; do not return partial financial data if a batch fails.
  const typedBookings: BookingRow[] = [];
  for (let start = 0; start < lineIds.length; start += lookupBatchSize) {
    const batchIds = lineIds.slice(start, start + lookupBatchSize);
    const { data: bookings, error: bookingsError } = await db
      .from("bookings")
      .select("id, order_line_id, event_id, ticket_type_id, auth_user_id, quantity, status, created_at")
      .in("order_line_id", batchIds);
    if (bookingsError) {
      console.error("[event-orders] Booking batch failed", {
        code: bookingsError.code,
        batch: Math.floor(start / lookupBatchSize) + 1,
        batchSize: batchIds.length,
      });
      throw new Error("Could not load event bookings");
    }
    typedBookings.push(...((bookings ?? []) as BookingRow[]));
  }

  const eventIds = [...new Set(typedBookings.map((booking) => booking.event_id))];
  const ticketIds = [...new Set(typedBookings.map((booking) => booking.ticket_type_id))];
  const customerIds = [...new Set(eventOrders.map((order) => order.auth_user_id).filter((id): id is string => Boolean(id)))];

  const events: EventRow[] = [];
  const tickets: TicketRow[] = [];
  const customers: CustomerRow[] = [];
  // All ID-based read paths are bounded, including those that are smaller today.
  // Keep errors explicit: the dashboard must not silently omit event/ticket metadata.
  for (let start = 0; start < eventIds.length; start += lookupBatchSize) {
    const { data, error: lookupError } = await db
      .from("events")
      .select("id, slug, title, series_name, starts_at")
      .in("id", eventIds.slice(start, start + lookupBatchSize));
    if (lookupError) {
      console.error("[event-orders] Event batch failed", { code: lookupError.code, batch: Math.floor(start / lookupBatchSize) + 1 });
      throw new Error("Could not load event details");
    }
    events.push(...((data ?? []) as EventRow[]));
  }
  for (let start = 0; start < ticketIds.length; start += lookupBatchSize) {
    const { data, error: lookupError } = await db
      .from("ticket_types")
      .select("id, name")
      .in("id", ticketIds.slice(start, start + lookupBatchSize));
    if (lookupError) {
      console.error("[event-orders] Ticket batch failed", { code: lookupError.code, batch: Math.floor(start / lookupBatchSize) + 1 });
      throw new Error("Could not load ticket details");
    }
    tickets.push(...((data ?? []) as TicketRow[]));
  }
  for (let start = 0; start < customerIds.length; start += lookupBatchSize) {
    const { data, error: lookupError } = await db
      .from("customers")
      .select("auth_user_id, email, display_name")
      .in("auth_user_id", customerIds.slice(start, start + lookupBatchSize));
    if (lookupError) {
      console.error("[event-orders] Customer batch failed", { code: lookupError.code, batch: Math.floor(start / lookupBatchSize) + 1 });
      throw new Error("Could not load order customers");
    }
    customers.push(...((data ?? []) as CustomerRow[]));
  }

  const saleDates = new Map<string, string>();
  const reportOrderIds = [...eventOrderIds];
  for (let start = 0; start < reportOrderIds.length; start += lookupBatchSize) {
    const { data, error: salesError } = await db.from("in_store_sales").select("order_id, sale_date")
      .in("order_id", reportOrderIds.slice(start, start + lookupBatchSize));
    if (salesError) {
      if (start === 0 && isMissingInStoreTable(salesError.code)) break;
      console.error("[event-orders] Sale date batch failed", { code: salesError.code });
      throw new Error("Could not load in-store sale dates");
    }
    for (const sale of data ?? []) saleDates.set(sale.order_id, sale.sale_date);
  }

  const bookingsByLine = new Map(typedBookings.map((booking) => [booking.order_line_id, booking]));
  const eventsById = new Map(events.map((event) => [event.id, event]));
  const ticketsById = new Map(tickets.map((ticket) => [ticket.id, ticket]));
  const customersById = new Map(customers.map((customer) => [customer.auth_user_id, customer]));

  return {
    orders: eventOrders.map((order) => ({
      ...order,
      sumupSaleDate: saleDates.get(order.id) ?? null,
      lines: typedLines.filter((line) => line.order_id === order.id).map((line) => {
        const booking = bookingsByLine.get(line.id);
        return { ...line, booking, event: booking ? eventsById.get(booking.event_id) : undefined, ticket: booking ? ticketsById.get(booking.ticket_type_id) : undefined };
      }),
    })),
    customers: customersById,
  };
}

async function canClaimPreviewTestOrders(verifiedEmail?: string | null) {
  const adminId = previewPilotAdminForGuestClaim();
  if (!adminId || !verifiedEmail) return false;

  const { data, error } = await appCoreDb().from("in_store_sales")
    .select("sumup_reference, created_by_auth_user_id, orders!inner(auth_user_id)")
    .eq("customer_email", verifiedEmail.trim().toLowerCase()).is("orders.auth_user_id", null)
    .limit(101);
  return !error && Boolean(data?.length && data.length <= 100 &&
    data.every((sale) => isPreviewPilotSale(sale, adminId)));
}

export const getCustomerEventOrders = cache(async (authUserId: string, verifiedEmail?: string | null) => {
  if (inStoreWriteMode() || await canClaimPreviewTestOrders(verifiedEmail)) {
    const { error } = await appCoreDb().rpc("link_verified_in_store_bookings", { p_auth_user_id: authUserId });
    if (error && error.code !== "PGRST202" && error.code !== "42883") {
      console.error("[event-orders] Guest booking link failed", { code: error.code });
    }
  }
  return (await loadEventOrders(authUserId)).orders;
});

export async function getAdminEventOrders() {
  return loadEventOrders();
}
