import "server-only";

import { appCoreDb } from "@/lib/app-core/service";
import { FROM, getResendClient } from "@/lib/email/client";

type Confirmation = {
  order_id: string;
  customer_email: string;
  customer_name: string;
  sumup_reference: string;
  sale_date: string;
  registration_offered: boolean;
  confirmation_details: {
    eventName: string;
    startsAt: string;
    totalPence: number;
    tickets: Array<{ name: string; quantity: number }>;
  };
};

export type InStoreConfirmationStatus = "sent" | "failed" | "pending" | "review";

const eventDate = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London", weekday: "long", day: "numeric",
  month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
});

function confirmationText(sale: Confirmation) {
  const { eventName, startsAt, totalPence, tickets } = sale.confirmation_details;
  const lines = [
    `Hello ${sale.customer_name},`, "",
    "Your Pages & Peace in-store event booking is confirmed.", "",
    `Event: ${eventName}`,
    `When: ${eventDate.format(new Date(startsAt))} (UK time)`,
    "Tickets:",
    ...tickets.map((ticket) => ` - ${ticket.name} × ${ticket.quantity}`),
    `Total paid: £${(totalPence / 100).toFixed(2)}`,
    `Date of sale: ${sale.sale_date}`,
    `Booking reference: ${sale.order_id.slice(0, 8).toUpperCase()}`,
    `SumUp purchase reference: ${sale.sumup_reference}`, "",
    "Please keep this email and show it at the event. You do not need an online account to attend.",
  ];
  if (sale.registration_offered) lines.push(
    "",
    "Optional: create a Pages & Peace account to view your bookings.",
    "Visit https://pagesandpeace.co.uk/sign-in and use this same email address.",
    "Follow the secure link we send you to verify your email and open your account."
  );
  return [...lines, "", "We look forward to seeing you!", "Pages & Peace"].join("\n");
}

export async function confirmInStoreSale(orderId: string): Promise<InStoreConfirmationStatus | null> {
  const db = appCoreDb();
  const { data: sale, error: startError } = await db.rpc("begin_in_store_confirmation", { p_order_id: orderId }).maybeSingle<Confirmation>();
  if (startError) {
    console.error("[in-store-sales] Confirmation start failed", { code: startError.code });
    return "pending";
  }

  if (!sale) {
    const { data, error } = await db.from("in_store_sales").select("confirmation_status")
      .eq("order_id", orderId).maybeSingle();
    if (error) {
      console.error("[in-store-sales] Confirmation lookup failed", { code: error.code });
      return "pending";
    }
    if (!data) return null;
    return data.confirmation_status === "sent" ? "sent" : "review";
  }

  let providerId: string | undefined;
  try {
    const { data, error } = await getResendClient().emails.send({
      from: FROM,
      to: sale.customer_email,
      subject: "Your Pages & Peace event booking confirmation",
      text: confirmationText(sale),
    }, { idempotencyKey: `in-store-booking-confirmation/${orderId}` });
    providerId = data?.id;
    if (error || !providerId) throw new Error("No provider confirmation");
  } catch {
    console.error("[in-store-sales] Booking confirmation attempt failed");
  }

  const { data: updated, error } = await db.from("in_store_sales").update(providerId ? {
    confirmation_status: "sent",
    confirmation_sent_at: new Date().toISOString(),
    confirmation_provider_id: providerId,
  } : { confirmation_status: "failed" })
    .eq("order_id", orderId).neq("confirmation_status", "sent").select("order_id").maybeSingle();
  if (error) {
    console.error("[in-store-sales] Confirmation status update failed", { code: error.code });
    return "pending";
  }
  return providerId || !updated ? "sent" : "failed";
}
