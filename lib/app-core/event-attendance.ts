import "server-only";

import { isMissingInStoreTable } from "@/lib/app-core/in-store";
import { appCoreDb } from "@/lib/app-core/service";

export type EventAttendanceRow = {
  bookingId: string;
  customerName: string;
  customerEmail: string;
  ticketType: string;
  activeQuantity: number;
  bookingStatus: "confirmed";
  salesChannel: "online" | "sumup";
};

export type EventAttendanceSummary = {
  attendees: number;
  bookings: number;
};

/**
 * Canonical operational attendance for an event. A booking represents a line
 * item, so the attendee count is its confirmed quantity less any line-level
 * refunded quantity. Fully refunded and cancelled bookings are intentionally
 * omitted rather than shown as people expected at the door.
 */
export async function getEventAttendance(eventId: string): Promise<{
  rows: EventAttendanceRow[];
  summary: EventAttendanceSummary;
}> {
  const db = appCoreDb();
  const { data: bookings, error: bookingsError } = await db
    .from("bookings")
    .select("id, order_line_id, ticket_type_id, auth_user_id, quantity, status, customer_name, customer_email")
    .eq("event_id", eventId)
    .eq("status", "confirmed");

  if (bookingsError) throw new Error("Unable to load event attendance");

  const confirmedBookings = bookings ?? [];
  const lineIds = confirmedBookings.map((booking) => booking.order_line_id);
  const ticketTypeIds = [...new Set(confirmedBookings.map((booking) => booking.ticket_type_id))];
  const customerIds = [...new Set(confirmedBookings.map((booking) => booking.auth_user_id).filter((id): id is string => Boolean(id)))];

  const perBatch = 100;
  const chunks = (ids: string[]) => Array.from(
    { length: Math.ceil(ids.length / perBatch) },
    (_, index) => ids.slice(index * perBatch, (index + 1) * perBatch)
  );
  const [lineBatches, ticketBatches, customerBatches] = await Promise.all([
    Promise.all(chunks(lineIds).map((ids) => db.from("order_lines").select("id, refunded_quantity, order_id").in("id", ids))),
    Promise.all(chunks(ticketTypeIds).map((ids) => db.from("ticket_types").select("id, name").in("id", ids))),
    Promise.all(chunks(customerIds).map((ids) => db.from("customers").select("auth_user_id, display_name, email").in("auth_user_id", ids))),
  ]);
  if ([...lineBatches, ...ticketBatches, ...customerBatches].some(({ error }) => error)) {
    throw new Error("Unable to load attendance details");
  }
  const lines = lineBatches.flatMap(({ data }) => data ?? []);
  const ticketTypes = ticketBatches.flatMap(({ data }) => data ?? []);
  const customers = customerBatches.flatMap(({ data }) => data ?? []);

  const orderIds = [...new Set(lines.map((line) => line.order_id))];
  const sumupOrders = new Set<string>();
  for (const ids of chunks(orderIds)) {
    const { data, error } = await db.from("in_store_sales").select("order_id").in("order_id", ids);
    // Allow existing online attendance before the additive migration is installed.
    if (error && isMissingInStoreTable(error.code) && ids[0] === orderIds[0]) break;
    if (error) throw new Error("Unable to load event sales channels");
    for (const sale of data ?? []) sumupOrders.add(sale.order_id);
  }
  const orderByLine = new Map(lines.map((line) => [line.id, line.order_id]));

  const refundedByLine = new Map(lines.map((line) => [line.id, Number(line.refunded_quantity ?? 0)]));
  const ticketById = new Map(ticketTypes.map((ticket) => [ticket.id, ticket.name]));
  const customerById = new Map(customers.map((customer) => [customer.auth_user_id, customer]));

  const rows = confirmedBookings.flatMap((booking): EventAttendanceRow[] => {
    const activeQuantity = Math.max(0, Number(booking.quantity) - (refundedByLine.get(booking.order_line_id) ?? 0));
    if (!activeQuantity) return [];

    const customer = customerById.get(booking.auth_user_id);
    return [{
      bookingId: booking.id,
      customerName: booking.customer_name || customer?.display_name || "Guest",
      customerEmail: booking.customer_email || customer?.email || "",
      ticketType: ticketById.get(booking.ticket_type_id) || "Ticket",
      activeQuantity,
      bookingStatus: "confirmed",
      salesChannel: sumupOrders.has(orderByLine.get(booking.order_line_id) ?? "") ? "sumup" : "online",
    }];
  }).sort((a, b) => a.customerName.localeCompare(b.customerName));

  return {
    rows,
    summary: { attendees: rows.reduce((total, row) => total + row.activeQuantity, 0), bookings: rows.length },
  };
}
