import { NextResponse } from "next/server";
import { Resend } from "resend";
import { appCoreDb } from "@/lib/app-core/service";
import { requireAdminUser } from "@/lib/auth/require-admin-user";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const marketingText = "Yes, I would like Pages & Peace to email me news about events, books and the café. I can unsubscribe at any time.";
export async function GET() {
  if (!await requireAdminUser()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
  return NextResponse.json({ events: events ?? [], tickets });
}
type SaleBody = {
  eventId?: unknown; items?: unknown; customerName?: unknown; customerEmail?: unknown;
  sumupReference?: unknown; paidAt?: unknown; expectedTotalPence?: unknown;
  sendInvitation?: unknown; marketingConsent?: unknown; confirmedPayment?: unknown;
};
async function sendInvitation(email: string, name: string) {
  if (!process.env.RESEND_API_KEY) throw new Error("Email service unavailable");
  const url = new URL("https://pagesandpeace.co.uk/sign-up");
  url.searchParams.set("email", email);
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: "Pages & Peace <admin@pagesandpeace.co.uk>", to: email,
    subject: "Your Pages & Peace account invitation",
    text: [
      "Hello " + name + ",", "", "Thank you for booking an event in our shop.",
      "If you would like to view your tickets online, create your account whenever you are ready:",
      url.toString(), "",
      "Please sign up with the same email address used for your in-store booking.",
      "You will verify your email with a secure sign-in link.",
      "There is no need to create an account to attend your event.", "Pages & Peace",
    ].join("\n"),
  });
  if (error) throw new Error("Invitation delivery failed");
}
async function subscribeMarketing(email: string) {
  const publicationId = process.env.BEEHIIV_PUBLICATION_ID;
  const apiKey = process.env.BEEHIIV_API_KEY;
  if (!publicationId || !apiKey) return "not_configured" as const;
  try {
    const response = await fetch("https://api.beehiiv.com/v2/publications/" + publicationId + "/subscriptions", {
      method: "POST",
      headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email, reactivate_existing: true, send_welcome_email: true }),
    });
    return response.ok ? "subscribed" as const : "failed" as const;
  } catch {
    return "failed" as const;
  }
}
export async function POST(request: Request) {
  const admin = await requireAdminUser();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (process.env.VERCEL_ENV === "preview") return NextResponse.json({ error: "Preview is read-only. Test sales using an isolated local database." }, { status: 403 });
  let body: SaleBody;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const eventId = typeof body.eventId === "string" ? body.eventId : "";
  const name = typeof body.customerName === "string" ? body.customerName.trim() : "";
  const email = typeof body.customerEmail === "string" ? body.customerEmail.trim().toLowerCase() : "";
  const reference = typeof body.sumupReference === "string" ? body.sumupReference.trim() : "";
  const paidAt = typeof body.paidAt === "string" ? new Date(body.paidAt) : new Date(NaN);
  const validItems = Array.isArray(body.items) && body.items.length > 0 && body.items.length <= 20 &&
    body.items.every((item: unknown) => {
      if (!item || typeof item !== "object") return false;
      const candidate = item as { ticketTypeId?: unknown; quantity?: unknown };
      return typeof candidate.ticketTypeId === "string" && uuid.test(candidate.ticketTypeId) &&
        Number.isInteger(candidate.quantity) && Number(candidate.quantity) >= 1 && Number(candidate.quantity) <= 10;
    });
  if (!uuid.test(eventId) || !name || name.length > 120 || !emailPattern.test(email) || email.length > 254 ||
    reference.length < 3 || reference.length > 128 || !Number.isFinite(paidAt.getTime()) ||
    !validItems || body.confirmedPayment !== true ||
    !Number.isInteger(body.expectedTotalPence) || Number(body.expectedTotalPence) < 0) {
    return NextResponse.json({ error: "Complete all fields and confirm SumUp payment." }, { status: 400 });
  }
  const db = appCoreDb();
  const { data: tickets, error: lookupError } = await db.from("ticket_types")
    .select("id, event_id, price_pence").eq("event_id", eventId).eq("is_active", true);
  if (lookupError) return NextResponse.json({ error: "Unable to verify ticket prices" }, { status: 503 });
  const prices = new Map((tickets ?? []).map((t) => [t.id, t.price_pence]));
  const items = body.items as Array<{ ticketTypeId: string; quantity: number }>;
  const total = items.reduce((sum, item) => sum + (prices.get(item.ticketTypeId) ?? 0) * item.quantity, 0);
  if (items.some((item) => !prices.has(item.ticketTypeId)) || total !== body.expectedTotalPence) {
    return NextResponse.json({ error: "Ticket prices changed. Refresh before recording payment." }, { status: 409 });
  }
  const { data: orderId, error: saleError } = await db.rpc("record_in_store_sale", {
    p_event_id: eventId, p_items: items, p_customer_name: name, p_customer_email: email,
    p_sumup_reference: reference, p_paid_at: paidAt.toISOString(), p_admin_id: admin.id,
    p_send_invitation: body.sendInvitation === true, p_marketing_consent: body.marketingConsent === true,
    p_marketing_text: body.marketingConsent === true ? marketingText : null,
  });
  if (saleError || !orderId) {
    const known = ["DUPLICATE_SUMUP_REFERENCE", "NOT_ENOUGH_SEATS", "TICKET_UNAVAILABLE", "GROUP_TICKETS_REQUIRED", "EVENT_UNAVAILABLE"];
    console.error("[in-store-sales] Record failed", { code: saleError?.code });
    return NextResponse.json({ error: known.includes(saleError?.message ?? "") ? saleError?.message : "Unable to record sale; check reference and capacity." }, { status: 409 });
  }
  let invitation: "not_requested" | "sent" | "failed" = "not_requested";
  if (body.sendInvitation === true) {
    try {
      await sendInvitation(email, name);
      invitation = "sent";
      await db.from("in_store_sales").update({ invitation_sent_at: new Date().toISOString(), invitation_error: null }).eq("order_id", orderId);
    } catch {
      invitation = "failed";
      await db.from("in_store_sales").update({ invitation_error: "Delivery failed" }).eq("order_id", orderId);
    }
  }
  let marketing: "not_requested" | "subscribed" | "failed" | "not_configured" = "not_requested";
  if (body.marketingConsent === true) {
    marketing = await subscribeMarketing(email);
    await db.from("in_store_sales").update({
      marketing_subscription_status: marketing,
      marketing_subscribed_at: marketing === "subscribed" ? new Date().toISOString() : null,
    }).eq("order_id", orderId);
    if (marketing === "subscribed") {
      const { data: customer } = await db.from("customers").select("auth_user_id").eq("email", email).maybeSingle();
      if (customer) await db.from("customers").update({
        marketing_consent: true, marketing_consent_at: new Date().toISOString(),
        beehiiv_subscribed: true, beehiiv_subscribed_at: new Date().toISOString(),
      }).eq("auth_user_id", customer.auth_user_id);
    }
  }
  return NextResponse.json({ success: true, orderId, invitation, marketing });
}
