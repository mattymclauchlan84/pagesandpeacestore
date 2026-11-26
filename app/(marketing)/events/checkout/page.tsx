"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { hasRequiredGroupTickets, readEventBookingRule } from "@/lib/app-core/event-booking-rule";

type BasketItem = { ticketTypeId: string; quantity: number };
type EventSummary = { title: string; slug: string; starts_at: string; booking_rule?: unknown };
type TicketDetail = { id: string; name: string; price_pence: number; events: EventSummary | EventSummary[] };

const basketKey = "app_core_event_basket_v1";
const groupError = "Add at least one child and one accompanying adult for each event that requires a group booking.";

function readBasket(): BasketItem[] {
  try {
    const items: unknown = JSON.parse(localStorage.getItem(basketKey) ?? "[]");
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

function writeBasket(items: BasketItem[]) {
  localStorage.setItem(basketKey, JSON.stringify(items));
  window.dispatchEvent(new Event("app-core-basket-changed"));
}

function eventFromTicket(ticket: TicketDetail) {
  return Array.isArray(ticket.events) ? ticket.events[0] : ticket.events;
}

export default function EventCheckoutPage() {
  const [items, setItems] = useState<BasketItem[]>([]);
  const [details, setDetails] = useState<TicketDetail[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const basket = readBasket();

    async function loadBasket() {
      if (!basket.length) return;
      try {
        const response = await fetch("/api/app-core/basket", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticketTypeIds: basket.map((item) => item.ticketTypeId) }),
          signal: controller.signal,
        });
        const body = await response.json();
        if (!response.ok || !Array.isArray(body.items)) throw new Error("Basket unavailable");
        if (controller.signal.aborted) return;

        const validIds = new Set(body.items.map((ticket: TicketDetail) => ticket.id));
        const validBasket = basket.filter((item) => validIds.has(item.ticketTypeId));
        setItems(validBasket);
        setDetails(body.items);
        if (validBasket.length !== basket.length) {
          writeBasket(validBasket);
          setStatus("We removed ticket(s) that are no longer on sale from your basket.");
        }
      } catch {
        if (controller.signal.aborted) return;
        setItems(basket);
        setStatus("We could not load this basket. Please refresh and try again.");
      }
    }

    void loadBasket().finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, []);

  const detailById = new Map(details.map((ticket) => [ticket.id, ticket]));
  const enriched = items.flatMap((item) => {
    const detail = detailById.get(item.ticketTypeId);
    return detail ? [{ ...item, detail }] : [];
  });
  const selectedIds = new Set(enriched.filter((item) => item.quantity > 0).map((item) => item.ticketTypeId));
  const incompleteGroups = new Map<string, EventSummary>();

  for (const item of enriched) {
    const event = eventFromTicket(item.detail);
    const rule = readEventBookingRule(event?.booking_rule);
    if (rule && !hasRequiredGroupTickets(rule, selectedIds)) incompleteGroups.set(event.slug, event);
  }

  const total = enriched.reduce((sum, item) => sum + item.quantity * item.detail.price_pence, 0);

  async function checkout() {
    if (paying || incompleteGroups.size > 0) return;
    setPaying(true);
    setStatus("Preparing secure checkout…");

    try {
      const response = await fetch("/api/app-core/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const body = await response.json().catch(() => ({}));
      if (response.status === 401 || body.error === "AUTH_REQUIRED") {
        window.location.assign(`/sign-in?callbackURL=${encodeURIComponent("/events/checkout")}`);
        return;
      }
      if (response.ok && body.url) {
        window.location.assign(body.url);
        return;
      }

      if (body.error === "NOT_ENOUGH_SEATS") {
        setStatus("There are no longer enough places available. Please adjust your basket.");
      } else if (body.error === "GROUP_TICKETS_REQUIRED") {
        setStatus(`${groupError} Open the event from your basket to update your tickets.`);
      } else {
        setStatus("Checkout could not be started. Please try again.");
      }
    } catch {
      setStatus("Checkout could not be started. Please try again.");
    }
    setPaying(false);
  }

  function remove(ticketId: string) {
    const next = items.filter((item) => item.ticketTypeId !== ticketId);
    setItems(next);
    writeBasket(next);
    setDetails((previous) => previous.filter((detail) => detail.id !== ticketId));
    setStatus("");
  }

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <Link href="/events" className="text-sm underline">← Continue browsing</Link>
      <h1 className="mt-5 text-3xl font-bold">Your tickets</h1>
      <p className="mt-2 text-foreground/65">One quick review, then secure payment with Stripe.</p>

      {loading ? <p className="mt-8">Loading basket…</p> : items.length === 0 ? (
        <div className="mt-8 rounded-2xl border p-6">
          <p>Your basket is empty.</p>
          <Link href="/events" className="mt-4 inline-flex rounded-lg bg-black px-4 py-2 font-semibold text-white">Browse events</Link>
        </div>
      ) : (
        <div className="mt-7 space-y-3">
          {enriched.map((item) => {
            const event = eventFromTicket(item.detail);
            return (
              <div key={item.ticketTypeId} className="flex items-start justify-between gap-4 rounded-xl border bg-white p-4">
                <div>
                  {event?.slug ? <Link href={`/events/${event.slug}`} className="font-semibold hover:underline">{event.title}</Link> : null}
                  <p className="mt-1 text-sm text-foreground/65">{item.detail.name} × {item.quantity}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">£{((item.detail.price_pence * item.quantity) / 100).toFixed(2)}</p>
                  <button type="button" onClick={() => remove(item.ticketTypeId)} disabled={paying} className="mt-2 text-xs underline">Remove</button>
                </div>
              </div>
            );
          })}
          {incompleteGroups.size > 0 ? (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900" role="status">
              <p>{groupError}</p>
              {[...incompleteGroups.values()].map((event) => (
                <Link key={event.slug} href={`/events/${event.slug}`} className="mt-2 block font-semibold underline">Update tickets for {event.title}</Link>
              ))}
            </div>
          ) : null}
          <div className="sticky bottom-0 -mx-4 border-t bg-background/95 px-4 py-4 backdrop-blur sm:static sm:mx-0 sm:rounded-xl sm:border sm:p-5">
            <div className="flex justify-between text-lg font-bold"><span>Total</span><span>£{(total / 100).toFixed(2)}</span></div>
            <button type="button" onClick={checkout} disabled={!enriched.length || paying || incompleteGroups.size > 0} className="mt-3 w-full rounded-xl bg-black px-4 py-3.5 font-semibold text-white disabled:opacity-50">
              {paying ? "Opening secure payment…" : "Pay securely"}
            </button>
            <p className="mt-2 text-center text-xs text-foreground/55">Apple Pay, Google Pay and other eligible methods are shown by Stripe when available.</p>
          </div>
        </div>
      )}
      {status ? <p className="mt-4 text-sm" role="status">{status}</p> : null}
    </main>
  );
}
