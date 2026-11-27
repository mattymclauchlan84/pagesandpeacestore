import { NextResponse } from "next/server";
import { Resend } from "resend";
import { appCoreDb } from "@/lib/app-core/service";
import { requireAdminUser } from "@/lib/auth/require-admin-user";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const marketingText = "Yes, I would like Pages & Peace to email me news about events, books and the café. I can unsubscribe at any time.";
export async function GET(request: Request) {
  if (!await requireAdminUser()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const db = appCoreDb();
  const lookupEmail = new URL(request.url).searchParams.get("email")?.trim().toLowerCase() ?? "";
  if (lookupEmail) {
    if (!emailPattern.test(lookupEmail) || lookupEmail.length > 254) return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    const { data: customer, error: lookupError } = await db.from("customers")
      .select("auth_user_id").eq("email", lookupEmail).eq("email_verified", true).limit(1).maybeSingle();
    if (lookupError) return NextResponse.json({ error: "Customer lookup unavailable" }, { status: 503 });
    return NextResponse.json({ existingCustomer: Boolean(customer) });
  }
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
  return NextResponse.json({ events: events ?? [], tickets });
}
type SaleBody = {
  eventId?: unknown; items?: unknown; customerName?: unknown; customerEmail?: unknown;
  sumupReference?: unknown; saleDate?: unknown; expectedTotalPence?: unknown;
  confirmedPayment?: unknown;
};

function formatEventDate(value: string) {
  return new Date(value).toLocaleString("en-GB", {
    timeZone: "Europe/London", weekday: "long", day: "numeric",
    month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

async function sendBookingConfirmation(args: {
  orderId: string; email: string; name: string; reference: string;
  eventName: string; startsAt: string; saleDate: string; totalPence: number;
  tickets: Array<{ name: string; quantity: number }>; offerRegistration: boolean;
}) {
  if (!process.env.RESEND_API_KEY) throw new Error("Email service unavailable");
  const lines = [
    "Hello " + args.name + ",", "",
    "Your Pages & Peace in-store event booking is confirmed.",
    "",
    "Event: " + args.eventName,
    "When: " + formatEventDate(args.startsAt) + " (UK time)",
    "Tickets:",
    ...args.tickets.map((ticket) => " - " + ticket.name + " x " + ticket.quantity),
    "Total paid: £" + (args.totalPence / 100).toFixed(2),
    "Date of sale: " + args.saleDate,
    "Booking reference: " + args.orderId.slice(0, 8).toUpperCase(),
    "SumUp purchase reference: " + args.reference,
    "",
    "Please keep this email and show it at the event. You do not need an online account to attend.",
  ];
  if (args.offerRegistration) lines.push(
    "",
    "Optional: create a Pages & Peace account to view your event bookings online:",
    "https://pagesandpeace.co.uk/sign-up",
    "Sign up using this same email address, then verify it using the secure link we send you.",
    "Creating an account is optional. You can choose your marketing preferences during sign-up."
  );
  lines.push("", "We look forward to seeing you!", "Pages & Peace");
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: "Pages & Peace <admin@pagesandpeace.co.uk>",
    to: args.email,
    subject: "Your Pages & Peace event booking confirmation",
    text: lines.join("\n"),
  }, { idempotencyKey: "in-store-booking-confirmation/" + args.orderId });
  if (error) throw new Error("Confirmation delivery failed");
}

export async function POST(request: Request) {
  const admin = await requireAdminUser();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const localUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const isolatedTest = process.env.ALLOW_LOCAL_IN_STORE_TESTS === "true" &&
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/i.test(localUrl);
  if (process.env.VERCEL_ENV !== "production" && !isolatedTest) {
    return NextResponse.json({ error: "Preview is read-only; bookings require isolated local testing." }, { status: 403 });
  }
  let body: SaleBody;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
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
      return typeof candidate.ticketTypeId === "string" && uuid.test(candidate.ticketTypeId) &&
        Number.isInteger(candidate.quantity) && Number(candidate.quantity) >= 1 && Number(candidate.quantity) <= 10;
    });
  if (!uuid.test(eventId) || !name || name.length > 120 || !emailPattern.test(email) || email.length > 254 ||
    reference.length < 3 || reference.length > 128 || !validDate ||
    !validItems || body.confirmedPayment !== true ||
    !Number.isInteger(body.expectedTotalPence) || Number(body.expectedTotalPence) < 0) {
    return NextResponse.json({ error: "Complete all fields and confirm SumUp payment." }, { status: 400 });
  }

  const db = appCoreDb();
  const [{ data: event, error: eventError }, { data: ticketData, error: lookupError }] = await Promise.all([
    db.from("events").select("id,title,starts_at").eq("id", eventId).single(),
    db.from("ticket_types").select("id,event_id,name,price_pence").eq("event_id", eventId).eq("is_active", true),
  ]);
  if (lookupError || eventError || !event) {
    return NextResponse.json({ error: "Unable to verify event and ticket details" }, { status: 503 });
  }
  const tickets = new Map((ticketData ?? []).map((ticket) => [ticket.id, ticket]));
  const items = body.items as Array<{ ticketTypeId: string; quantity: number }>;
  const total = items.reduce((sum, item) => sum + (tickets.get(item.ticketTypeId)?.price_pence ?? 0) * item.quantity, 0);
  if (items.some((item) => !tickets.has(item.ticketTypeId)) || total !== body.expectedTotalPence) {
    return NextResponse.json({ error: "Ticket prices changed. Refresh before recording payment." }, { status: 409 });
  }

  const { data: orderId, error: saleError } = await db.rpc("record_in_store_sale", {
    p_event_id: eventId, p_items: items, p_customer_name: name, p_customer_email: email,
    p_sumup_reference: reference, p_sale_date: saleDate,
    p_expected_total_pence: body.expectedTotalPence, p_admin_id: admin.id,
  });
  if (saleError || !orderId) {
    const known = ["DUPLICATE_SUMUP_REFERENCE", "NOT_ENOUGH_SEATS", "TICKET_UNAVAILABLE",
      "GROUP_TICKETS_REQUIRED", "EVENT_UNAVAILABLE", "PRICE_CHANGED"];
    console.error("[in-store-sales] Record failed", { code: saleError?.code });
    return NextResponse.json({
      error: known.includes(saleError?.message ?? "") ? saleError?.message :
        "Unable to record sale; check reference and capacity.",
    }, { status: 409 });
  }

  // The transaction has committed. Only this committed order can trigger email.
  const { data: savedOrder, error: savedError } = await db.from("orders")
    .select("auth_user_id").eq("id", orderId).single();
  if (savedError || !savedOrder) {
    console.error("[in-store-sales] Failed to retrieve committed order", { code: savedError?.code });
  }
  const offerRegistration = savedOrder?.auth_user_id == null;
  let confirmation: "sent" | "failed" = "failed";
  try {
    await sendBookingConfirmation({
      orderId, email, name, reference, saleDate, eventName: event.title,
      startsAt: event.starts_at, totalPence: total,
      tickets: items.map((item) => ({ name: tickets.get(item.ticketTypeId)?.name ?? "Event ticket", quantity: item.quantity })),
      offerRegistration,
    });
    confirmation = "sent";
  } catch (error) {
    console.error("[in-store-sales] Booking email failed", {
      category: error instanceof Error ? error.name : "unknown",
    });
  }
  const { error: statusError } = await db.from("in_store_sales").update({
    confirmation_status: confirmation,
    confirmation_sent_at: confirmation === "sent" ? new Date().toISOString() : null,
    confirmation_error: confirmation === "failed" ? "Delivery failed" : null,
    registration_offered: offerRegistration,
  }).eq("order_id", orderId);
  if (statusError) console.error("[in-store-sales] Confirmation status update failed", { code: statusError.code });

  return NextResponse.json({ success: true, orderId, confirmation });
}
