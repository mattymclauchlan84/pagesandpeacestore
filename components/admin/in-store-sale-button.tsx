"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type EventOption = { id: string; title: string; starts_at: string; capacity: number; booking_rule: { child_ticket_id?: string; adult_ticket_id?: string } | null };
type TicketOption = { id: string; event_id: string; name: string; price_pence: number; capacity: number | null };
type Data = { events: EventOption[]; tickets: TicketOption[] };
const money = (pence: number) => "£" + (pence / 100).toFixed(2);
const londonDate = (date: string) => new Date(date).toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "medium", timeStyle: "short" });

export default function InStoreSaleButton({ defaultEventId }: { defaultEventId?: string }) {
  const router = useRouter();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Data | null>(null);
  const [eventId, setEventId] = useState(defaultEventId ?? "");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerMatch, setCustomerMatch] = useState<"known" | "guest" | "checking" | null>(null);
  const [reference, setReference] = useState("");
  const [saleDate, setSaleDate] = useState(() =>
    (() => {
      const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date())
      .reduce((parts, item) => ({ ...parts, [item.type]: item.value }), {} as Record<string, string>);
      return parts.year + "-" + parts.month + "-" + parts.day;
    })()
  );
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError("");
    fetch("/api/app-core/admin/in-store-sales", { cache: "no-store" })
      .then(async (res) => { const value = await res.json(); if (!res.ok) throw new Error(value.error ?? "Unable to load events"); return value as Data; })
      .then((value) => { if (active) { setData(value); setEventId((id) => id || value.events[0]?.id || ""); } })
      .catch((e) => { if (active) setError(e instanceof Error ? e.message : "Unable to load events"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open]);

  async function checkCustomer() {
    const email = customerEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    setCustomerMatch("checking");
    try {
      const response = await fetch("/api/app-core/admin/in-store-sales?email=" + encodeURIComponent(email), { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error("Lookup unavailable");
      setCustomerMatch(result.existingCustomer ? "known" : "guest");
    } catch {
      setCustomerMatch(null);
    }
  }

  const event = data?.events.find((item) => item.id === eventId);
  const tickets = useMemo(() => (data?.tickets ?? []).filter((ticket) => ticket.event_id === eventId), [data, eventId]);
  const selected = tickets.filter((ticket) => (quantities[ticket.id] ?? 0) > 0);
  const totalPence = selected.reduce((sum, ticket) => sum + ticket.price_pence * quantities[ticket.id], 0);
  const totalQuantity = selected.reduce((sum, ticket) => sum + quantities[ticket.id], 0);
  const rule = event?.booking_rule;
  const missingGroup = !!rule && ((quantities[rule.child_ticket_id ?? ""] ?? 0) < 1 || (quantities[rule.adult_ticket_id ?? ""] ?? 0) < 1);
  const canSubmit = !loading && !busy && !!event && totalQuantity > 0 && !missingGroup && !!customerName.trim() && !!customerEmail.trim() &&
    reference.trim().length >= 3 && !!saleDate && confirmed;
  function close() { if (!busy) { setOpen(false); setSuccess(""); setError(""); } }

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/app-core/admin/in-store-sales", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId, items: selected.map((ticket) => ({ ticketTypeId: ticket.id, quantity: quantities[ticket.id] })),
          customerName: customerName.trim(), customerEmail: customerEmail.trim(),
          sumupReference: reference.trim(), saleDate,
          expectedTotalPence: totalPence, confirmedPayment: confirmed,
        }),
      });
      const result = await res.json().catch(() => null);
      if (!res.ok || !result?.success) throw new Error(result?.error ?? "Could not record sale");
      const message = "Sale recorded and " + totalQuantity + " place(s) reserved. " +
        (result.confirmation === "sent"
          ? "Booking confirmation emailed to the customer."
          : "Booking confirmation email could not be sent; please verify the address and arrange delivery.");
      setSuccess(message);
      setConfirmed(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to record sale");
    } finally { setBusy(false); }
  }

  return <>
    <button type="button" onClick={() => setOpen(true)} className="rounded-lg bg-emerald-800 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-900">
      Record in-store sale
    </button>
    {open ? <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-3 sm:p-6">
      <div className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-4 shadow-xl sm:p-6" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="flex items-start justify-between gap-3">
          <div><h2 id={titleId} className="text-xl font-bold">Record SumUp ticket sale</h2>
            <p className="mt-1 text-sm text-neutral-600">Only record payment after it has succeeded in SumUp.</p></div>
          <button type="button" onClick={close} aria-label="Close" className="rounded-full border px-3 py-1.5">✕</button>
        </div>
        {loading ? <p className="mt-6">Loading events…</p> : null}
        {success ? <div role="status" className="mt-5 rounded-lg border border-green-300 bg-green-50 p-4 text-sm text-green-900">{success}
          <div className="mt-3 flex gap-2">
            <button type="button" className="rounded-lg border px-3 py-2" onClick={() => { setSuccess(""); setReference(""); setQuantities({}); setCustomerName(""); setCustomerEmail(""); setCustomerMatch(null); }}>Record another</button>
            <button type="button" className="rounded-lg bg-green-800 px-3 py-2 text-white" onClick={close}>Close</button>
          </div>
        </div> : <div className="mt-5 space-y-4">
          <label className="block text-sm font-semibold">Event
            <select value={eventId} onChange={(e) => { setEventId(e.target.value); setQuantities({}); }} className="mt-1 w-full rounded-lg border p-3">
              {(data?.events ?? []).map((e) => <option key={e.id} value={e.id}>{e.title} — {londonDate(e.starts_at)}</option>)}
            </select>
          </label>
          <div className="rounded-xl border p-3">
            <h3 className="font-semibold">Ticket options</h3>
            {tickets.map((ticket) => <label key={ticket.id} className="mt-3 flex items-center justify-between gap-3 text-sm">
              <span>{ticket.name} <span className="text-neutral-500">({money(ticket.price_pence)})</span></span>
              <select aria-label={"Quantity for " + ticket.name} value={quantities[ticket.id] ?? 0}
                onChange={(e) => setQuantities((prev) => ({ ...prev, [ticket.id]: Number(e.target.value) }))}
                className="rounded-lg border p-2">
                {Array.from({ length: 11 }, (_, n) => n).map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>)}
            {missingGroup ? <p className="mt-2 text-sm text-amber-800">This event requires both child and adult tickets.</p> : null}
            <p className="mt-3 border-t pt-3 font-semibold">{totalQuantity} ticket(s) · {money(totalPence)}</p>
          </div>
          <label className="block text-sm font-semibold">Customer name
            <input autoComplete="name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="mt-1 w-full rounded-lg border p-3" placeholder="Full name"/>
          </label>
          <label className="block text-sm font-semibold">Customer email
            <input type="email" autoComplete="email" value={customerEmail} onChange={(e) => { setCustomerEmail(e.target.value); setCustomerMatch(null); }} onBlur={checkCustomer} className="mt-1 w-full rounded-lg border p-3" placeholder="customer@example.com"/>
          </label>
          <p className="text-xs text-neutral-600">Staff prompt: “Can I take your email so we can attach your tickets to your booking?” Existing verified customers are matched automatically. New customers can attend as guests.</p>{customerMatch === "checking" ? <p className="text-xs text-neutral-600">Checking customer…</p> : customerMatch === "known" ? <p className="text-xs font-medium text-emerald-800">Existing verified account found. Tickets will be associated with this customer.</p> : customerMatch === "guest" ? <p className="text-xs font-medium text-amber-800">No verified account found. Their confirmation email will include optional account registration.</p> : null}
          <label className="block text-sm font-semibold">SumUp transaction reference
            <input value={reference} onChange={(e) => setReference(e.target.value)} className="mt-1 w-full rounded-lg border p-3" placeholder="Reference from SumUp receipt"/>
          </label>
          <label className="block text-sm font-semibold">Date of SumUp sale (UK)
            <input type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} className="mt-1 w-full rounded-lg border p-3"/>
          </label>
          <p className="rounded-lg bg-stone-50 p-3 text-xs text-neutral-700">
            Staff prompt: “We'll email your booking confirmation to this address. If you don't already have an account,
            it will also include a link to register whenever you like, so you can view your bookings online.
            Registration is optional — just bring your confirmation email to the event.”
            Marketing preferences are chosen only during account registration.
          </p>
          <label className="flex items-start gap-2 text-sm font-semibold"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-1"/>
            I have verified the payment of {money(totalPence)} succeeded in the SumUp POS.
          </label>
          <p className="text-xs text-amber-800">Preview is read-only. No SumUp charges are initiated by Pages & Peace.</p>
          {error ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={close} disabled={busy} className="rounded-lg border px-4 py-2">Cancel</button>
            <button type="button" onClick={submit} disabled={!canSubmit} className="rounded-lg bg-emerald-800 px-4 py-2 font-semibold text-white disabled:opacity-40">
              {busy ? "Recording…" : "Confirm sale & reserve places"}
            </button>
          </div>
        </div>}
      </div>
    </div> : null}
  </>;
}
