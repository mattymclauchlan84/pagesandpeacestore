import { NextResponse } from "next/server";
import { appCoreDb } from "@/lib/app-core/service";
import { requireAdminUser } from "@/lib/auth/require-admin-user";
import { inStoreUuid, inStoreWriteMode, isInStoreTestReference, isPreviewPilotSale, readInStoreJson } from "@/lib/app-core/in-store";
import { confirmInStoreSale } from "@/lib/app-core/in-store-confirmation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const emailPattern = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

export async function GET() {
  const admin = await requireAdminUser();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const db = appCoreDb();
  const { data: events, error } = await db.from("events")
    .select("id, title, starts_at, capacity, booking_rule")
    .eq("status", "published").gt("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true }).limit(200);
  if (error) return NextResponse.json({ error: "Could not load events" }, { status: 503 });
  const eventIds = (events ?? []).map((e) => e.id);
  const tickets: Array<{ id: string; event_id: string; name: string; price_pence: number; capacity: number | null }> = [];
  for (let i = 0; i < eventIds.length; i += 100) {
    const { data, error: ticketError } = await db.from("ticket_types")
      .select("id, event_id, name, price_pence, capacity")
      .eq("is_active", true).in("event_id", eventIds.slice(i, i + 100));
    if (ticketError) return NextResponse.json({ error: "Could not load ticket options" }, { status: 503 });
    tickets.push(...(data ?? []));
  }
  const mode = inStoreWriteMode(admin.id);
  return NextResponse.json({ events: events ?? [], tickets, canRecord: Boolean(mode), previewPilot: mode === "preview-pilot" });
}

const saleErrors: Record<string, string> = {
  DUPLICATE_SUMUP_REFERENCE: "This SumUp reference is already used by another recorded sale.",
  NOT_ENOUGH_SEATS: "There are not enough available places for these ticket quantities.",
  TICKET_UNAVAILABLE: "One of these ticket options is unavailable. Reopen the sale form to refresh it.",
  INVALID_TICKETS: "Choose up to 30 tickets, with at most 10 of each type.",
  GROUP_TICKETS_REQUIRED: "This event requires both a child and an accompanying adult ticket.",
  EVENT_UNAVAILABLE: "This event is no longer available for sale.",
  INVALID_SALE_DATE: "Enter a valid UK sale date within the last year and no later than today.",
  PRICE_CHANGED: "Ticket prices changed. Reopen the sale form and check the payment total.",
};

async function canSendPilotConfirmation(orderId: string, adminId: string) {
  const { data, error } = await appCoreDb().from("in_store_sales")
    .select("sumup_reference, created_by_auth_user_id").eq("order_id", orderId).maybeSingle();
  return !error && Boolean(data && isPreviewPilotSale(data, adminId));
}

export async function POST(request: Request) {
  const admin = await requireAdminUser();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const mode = inStoreWriteMode(admin.id);
  if (!mode) {
    return NextResponse.json({ error: "In-store sales are read-only in this environment." }, { status: 403 });
  }
  const body = await readInStoreJson(request);
  if (!body) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  if ("retryConfirmationOrderId" in body) {
    const orderId = body.retryConfirmationOrderId;
    if (typeof orderId !== "string" || !inStoreUuid.test(orderId)) {
      return NextResponse.json({ error: "Invalid order" }, { status: 400 });
    }
    if (mode === "preview-pilot" && !await canSendPilotConfirmation(orderId, admin.id)) {
      return NextResponse.json({ error: "Preview retries are limited to your test sales." }, { status: 403 });
    }
    const confirmation = await confirmInStoreSale(orderId);
    if (!confirmation) return NextResponse.json({ error: "SumUp order not found" }, { status: 404 });
    return NextResponse.json({ success: true, orderId, confirmation });
  }

  const eventId = typeof body.eventId === "string" ? body.eventId : "";
  const name = typeof body.customerName === "string" ? body.customerName.trim() : "";
  const email = typeof body.customerEmail === "string" ? body.customerEmail.trim().toLowerCase() : "";
  const reference = typeof body.sumupReference === "string" ? body.sumupReference.trim() : "";
  const saleDate = typeof body.saleDate === "string" ? body.saleDate : "";
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(saleDate) &&
    !Number.isNaN(new Date(saleDate + "T12:00:00Z").getTime()) &&
    new Date(saleDate + "T12:00:00Z").toISOString().slice(0, 10) === saleDate;
  const validItems = Array.isArray(body.items) && body.items.length > 0 && body.items.length <= 20 &&
    body.items.every((item: unknown) => {
      if (!item || typeof item !== "object") return false;
      const candidate = item as { ticketTypeId?: unknown; quantity?: unknown };
      return typeof candidate.ticketTypeId === "string" && inStoreUuid.test(candidate.ticketTypeId) &&
        Number.isInteger(candidate.quantity) && Number(candidate.quantity) >= 1 && Number(candidate.quantity) <= 10;
    });
  if (!inStoreUuid.test(eventId) || !name || name.length > 120 || !emailPattern.test(email) || email.length > 254 ||
    reference.length < 3 || reference.length > 128 || !validDate ||
    !validItems || body.confirmedPayment !== true ||
    !Number.isInteger(body.expectedTotalPence) || Number(body.expectedTotalPence) < 0 || Number(body.expectedTotalPence) > 2147483647) {
    return NextResponse.json({ error: "Complete all fields and confirm SumUp payment." }, { status: 400 });
  }

  if (mode === "preview-pilot" && !isInStoreTestReference(reference)) {
    return NextResponse.json({ error: "Start the preview sale reference with TEST-." }, { status: 400 });
  }
  const db = appCoreDb();
  const items = body.items as Array<{ ticketTypeId: string; quantity: number }>;
  const { data: orderId, error: saleError } = await db.rpc("record_in_store_sale", {
    p_event_id: eventId, p_items: items, p_customer_name: name, p_customer_email: email,
    p_sumup_reference: reference, p_sale_date: saleDate,
    p_expected_total_pence: body.expectedTotalPence, p_admin_id: admin.id,
  });
  if (saleError || !orderId) {
    const message = saleErrors[saleError?.message ?? ""];
    if (!message) console.error("[in-store-sales] Record failed", { code: saleError?.code });
    return NextResponse.json({
      error: message ?? "Unable to verify whether the sale was recorded. Retry with the same details before doing anything in SumUp.",
    }, { status: message ? 409 : 503 });
  }

  if (mode === "preview-pilot" && !await canSendPilotConfirmation(orderId, admin.id)) {
    return NextResponse.json({ error: "The reference is unavailable for this preview test." }, { status: 409 });
  }
  const confirmation = await confirmInStoreSale(orderId) ?? "pending";
  return NextResponse.json({ success: true, orderId, confirmation });
}
