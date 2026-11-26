"use client";

import Link from "next/link";
import { useState, useSyncExternalStore, type FormEvent } from "react";
import type { EventBookingRule } from "@/lib/app-core/event-booking-rule";

type Ticket = {
  id: string;
  name: string;
  description: string | null;
  price_pence: number;
  remaining_seats: number;
};

type BasketItem = { ticketTypeId: string; quantity: number };

const basketKey = "app_core_event_basket_v1";
const basketChanged = "app-core-basket-changed";

function basketSnapshot() {
  return window.localStorage.getItem(basketKey) ?? "[]";
}

function serverSnapshot() {
  return "[]";
}

function subscribeToBasket(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(basketChanged, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(basketChanged, callback);
  };
}

function parseBasket(snapshot: string): BasketItem[] {
  try {
    const values: unknown = JSON.parse(snapshot);
    if (!Array.isArray(values)) return [];
    return values.filter((value): value is BasketItem =>
      typeof value?.ticketTypeId === "string" && Number.isInteger(value.quantity) && value.quantity > 0,
    );
  } catch {
    return [];
  }
}

const price = (pence: number) => `£${(pence / 100).toFixed(2)}`;

export function EventGroupTicketPicker({
  rule,
  tickets,
  soldOut,
  remainingSeats,
}: {
  rule: EventBookingRule;
  tickets: Ticket[];
  soldOut: boolean;
  remainingSeats: number;
}) {
  const basket = parseBasket(useSyncExternalStore(subscribeToBasket, basketSnapshot, serverSnapshot));
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const eventTicketIds = new Set(tickets.map((ticket) => ticket.id));
  const existing = new Map(basket.map((item) => [item.ticketTypeId, item.quantity]));
  const order = [rule.child_ticket_id, rule.adult_ticket_id];
  const orderedTickets = [
    ...order.flatMap((id) => tickets.filter((ticket) => ticket.id === id)),
    ...tickets.filter((ticket) => !order.includes(ticket.id)),
  ];
  const options = orderedTickets.map((ticket) => {
    const required = order.includes(ticket.id);
    const min = required ? 1 : 0;
    const max = Math.min(ticket.remaining_seats, 10);
    const value = max === 0 ? "0" : draft[ticket.id] ?? String(Math.max(min, existing.get(ticket.id) ?? 0));
    return { ticket, min, max, value, quantity: value === "" ? Number.NaN : Number(value) };
  });
  const editing = basket.some((item) => eventTicketIds.has(item.ticketTypeId));
  const validQuantities = options.every(({ min, max, quantity }) => Number.isInteger(quantity) && quantity >= min && quantity <= max);
  const count = options.reduce((sum, option) => sum + (option.quantity || 0), 0);
  const total = options.reduce((sum, option) => sum + (option.quantity || 0) * option.ticket.price_pence, 0);
  const overCapacity = count > remainingSeats;

  function updateBasket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (soldOut || !validQuantities || overCapacity) return;

    const others = parseBasket(basketSnapshot()).filter((item) => !eventTicketIds.has(item.ticketTypeId));
    const group = options.filter(({ quantity }) => quantity > 0)
      .map(({ ticket, quantity }) => ({ ticketTypeId: ticket.id, quantity }));
    if (others.length + group.length > 20) {
      setMessage("Your basket can hold up to 20 ticket options. Remove an option before adding this group.");
      return;
    }

    window.localStorage.setItem(basketKey, JSON.stringify([...others, ...group]));
    window.dispatchEvent(new Event(basketChanged));
    setDraft({});
    setMessage("Your group is in the basket.");
  }

  return (
    <form onSubmit={updateBasket} className="mt-7 space-y-4 border-t pt-6">
      <div>
        <h2 className="text-lg font-semibold">Book your group</h2>
        <p className="mt-1 text-sm text-foreground/70">Choose at least one child and one accompanying adult. Every adult and child needs a ticket.</p>
      </div>
      {soldOut ? <p className="text-sm font-medium">No more places are available for a child and an adult together.</p> : (
        <>
          {options.map(({ ticket, min, max, value }) => (
            <div key={ticket.id}>
              <label className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
                <span>
                  <span className="block font-medium">{ticket.name}</span>
                  <span className="block text-foreground/70">{price(ticket.price_pence)} each{max === 0 ? " · Sold out" : ""}</span>
                </span>
                <input type="number" inputMode="numeric" min={min} max={max} step={1} required
                  aria-label={`${ticket.name} quantity`}
                  className="w-16 rounded-md border px-2 py-1.5"
                  value={value}
                  disabled={max === 0}
                  onChange={(event) => {
                    const quantity = event.target.value;
                    setDraft((previous) => ({ ...previous, [ticket.id]: quantity }));
                    setMessage("");
                  }}
                />
              </label>
              {ticket.description ? <p className="mt-1 text-sm text-foreground/70">{ticket.description}</p> : null}
            </div>
          ))}
          {overCapacity ? <p className="text-sm font-medium text-red-800" role="status">There aren’t enough places for this group. Reduce your group size.</p> : null}
          <div className="flex justify-between text-sm font-semibold">
            <span>{count} {count === 1 ? "place" : "places"}</span><span>{price(total)}</span>
          </div>
          <button type="submit" disabled={!validQuantities || overCapacity} className="w-full rounded-lg bg-black px-4 py-3 font-semibold text-white disabled:opacity-50">
            {editing ? "Update group in basket" : "Add group to basket"}
          </button>
        </>
      )}
      {message ? <p className="text-sm" role="status">{message}</p> : null}
      <Link href="/events/checkout" className="block text-center text-sm underline underline-offset-4">View basket and checkout</Link>
    </form>
  );
}
