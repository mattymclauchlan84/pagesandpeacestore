"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog } from "radix-ui";
import { toLondonDateTimeInput } from "@/lib/time/london";
import { useRouter } from "next/navigation";

type EventOption = { id: string; title: string; starts_at: string; capacity: number; booking_rule: { child_ticket_id?: string; adult_ticket_id?: string } | null };
type TicketOption = { id: string; event_id: string; name: string; price_pence: number; capacity: number | null };
type Data = { events: EventOption[]; tickets: TicketOption[]; canRecord: boolean };
const money = (pence: number) => "£" + (pence / 100).toFixed(2);
const londonDate = (date: string) => new Date(date).toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "medium", timeStyle: "short" });

export default function InStoreSaleButton({ defaultEventId }: { defaultEventId?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Data | null>(null);
  const [eventId, setEventId] = useState(defaultEventId ?? "");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [reference, setReference] = useState("");
  const [saleDate, setSaleDate] = useState(() => toLondonDateTimeInput(new Date()).slice(0, 10));
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
      .then((value) => { if (active) { setData(value); setEventId((id) => value.events.some((event) => event.id === id) ? id : defaultEventId ? "" : value.events[0]?.id ?? ""); } })
      .catch((e) => { if (active) setError(e instanceof Error ? e.message : "Unable to load events"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, defaultEventId]);

  const event = data?.events.find((item) => item.id === eventId);
  const tickets = useMemo(() => (data?.tickets ?? []).filter((ticket) => ticket.event_id === eventId), [data, eventId]);
  const selected = tickets.filter((ticket) => (quantities[ticket.id] ?? 0) > 0);
  const totalPence = selected.reduce((sum, ticket) => sum + ticket.price_pence * quantities[ticket.id], 0);
  const totalQuantity = selected.reduce((sum, ticket) => sum + quantities[ticket.id], 0);
  const rule = event?.booking_rule;
  const missingGroup = !!rule && ((quantities[rule.child_ticket_id ?? ""] ?? 0) < 1 || (quantities[rule.adult_ticket_id ?? ""] ?? 0) < 1);
  const canSubmit = data?.canRecord && !loading && !busy && !!event && totalQuantity > 0 && totalQuantity <= 30 &&
    !missingGroup && !!customerName.trim() && /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(customerEmail.trim()) &&
    reference.trim().length >= 3 && !!saleDate && confirmed;

  function resetSale() {
    setSuccess("");
    setError("");
    setReference("");
    setQuantities({});
    setCustomerName("");
    setCustomerEmail("");
    setSaleDate(toLondonDateTimeInput(new Date()).slice(0, 10));
    setConfirmed(false);
  }

  function changeOpen(nextOpen: boolean) {
    if (busy) return;
    if (!nextOpen) resetSale();
    setOpen(nextOpen);
  }

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
      const emailStatus = result.confirmation === "sent" ? "Booking confirmation accepted by the email provider."
        : "Check confirmation status in the booking register, where you can retry or review delivery.";
      setSuccess(`Sale recorded and ${totalQuantity} ticket(s) confirmed. Booking ${result.orderId.slice(0, 8).toUpperCase()}. ${emailStatus}`);
      setConfirmed(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to record sale");
    } finally { setBusy(false); }
  }

  return <Dialog.Root open={open} onOpenChange={changeOpen}>
    <Dialog.Trigger className="rounded-lg bg-emerald-800 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-900">
      Record in-store sale
    </Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-[90] bg-black/60" />
      <Dialog.Content className="fixed inset-x-3 top-1/2 z-[91] mx-auto max-h-[92dvh] max-w-xl -translate-y-1/2 overflow-y-auto rounded-2xl bg-white p-4 shadow-xl sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div><Dialog.Title className="text-xl font-bold">Record SumUp ticket sale</Dialog.Title>
            <Dialog.Description className="mt-1 text-sm text-neutral-600">Only record payment after it has succeeded in SumUp.</Dialog.Description></div>
          <Dialog.Close type="button" disabled={busy} aria-label="Close" className="rounded-full border px-3 py-1.5">✕</Dialog.Close>
        </div>
        {loading ? <p className="mt-6">Loading events…</p> : null}
        {success ? <div role="status" className="mt-5 rounded-lg border border-green-300 bg-green-50 p-4 text-sm text-green-900">{success}
          <div className="mt-3 flex gap-2">
            <button type="button" className="rounded-lg border px-3 py-2" onClick={resetSale}>Record another</button>
            <button type="button" className="rounded-lg bg-green-800 px-3 py-2 text-white" onClick={() => changeOpen(false)}>Close</button>
          </div>
        </div> : <div className="mt-5 space-y-4">
          <label className="block text-sm font-semibold">Event
            <select value={eventId} onChange={(e) => { setEventId(e.target.value); setQuantities({}); setConfirmed(false); }} className="mt-1 w-full rounded-lg border p-3">
              {!eventId ? <option value="">Select an event</option> : null}
              {(data?.events ?? []).map((e) => <option key={e.id} value={e.id}>{e.title} — {londonDate(e.starts_at)}</option>)}
            </select>
          </label>
          {data && !loading && !eventId ? <p className="text-sm text-amber-800">No event is selected. Check the event before recording the sale.</p> : null}
          <div className="rounded-xl border p-3">
            <h3 className="font-semibold">Ticket options</h3>
            {tickets.map((ticket) => <label key={ticket.id} className="mt-3 flex items-center justify-between gap-3 text-sm">
              <span>{ticket.name} <span className="text-neutral-500">({money(ticket.price_pence)})</span></span>
              <select aria-label={"Quantity for " + ticket.name} value={quantities[ticket.id] ?? 0}
                onChange={(e) => { setQuantities((prev) => ({ ...prev, [ticket.id]: Number(e.target.value) })); setConfirmed(false); }}
                className="rounded-lg border p-2">
                {Array.from({ length: 11 }, (_, n) => n).map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>)}
            {totalQuantity > 30 ? <p className="mt-2 text-sm text-amber-800">Record up to 30 tickets per sale.</p> : null}
            {missingGroup ? <p className="mt-2 text-sm text-amber-800">This event requires both child and adult tickets.</p> : null}
            <p className="mt-3 border-t pt-3 font-semibold">{totalQuantity} ticket(s) · {money(totalPence)}</p>
          </div>
          <label className="block text-sm font-semibold">Customer name
            <input autoComplete="off" maxLength={120} value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="mt-1 w-full rounded-lg border p-3" placeholder="Full name"/>
          </label>
          <label className="block text-sm font-semibold">Customer email
            <input type="email" autoComplete="off" maxLength={254} value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} className="mt-1 w-full rounded-lg border p-3" placeholder="customer@example.com"/>
          </label>
          <label className="block text-sm font-semibold">SumUp transaction reference
            <input value={reference} autoComplete="off" maxLength={128} onChange={(e) => { setReference(e.target.value); setConfirmed(false); }} className="mt-1 w-full rounded-lg border p-3" placeholder="Reference from SumUp receipt"/>
          </label>
          <label className="block text-sm font-semibold">Date of SumUp sale (UK)
            <input type="date" value={saleDate} max={toLondonDateTimeInput(new Date()).slice(0, 10)} onChange={(e) => { setSaleDate(e.target.value); setConfirmed(false); }} className="mt-1 w-full rounded-lg border p-3"/>
          </label>
          <p className="rounded-lg bg-stone-50 p-3 text-xs text-neutral-700">
            Staff prompt: “We’ll email your booking confirmation to this address. If you don’t already have an account,
            it will also include a link to register whenever you like, so you can view your bookings online.
            Registration is optional — just bring your confirmation email to the event.”
            Marketing preferences are chosen only during account registration.
          </p>
          <label className="flex items-start gap-2 text-sm font-semibold"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-1"/>
            I have verified the payment of {money(totalPence)} succeeded in the SumUp POS.
          </label>
          {data && !data.canRecord ? <p className="text-xs text-amber-800">This preview is read-only.</p> : null}
          {error ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <button type="button" onClick={() => changeOpen(false)} disabled={busy} className="rounded-lg border px-4 py-2">Cancel</button>
            <button type="button" onClick={submit} disabled={!canSubmit} className="rounded-lg bg-emerald-800 px-4 py-2 font-semibold text-white disabled:opacity-40">
              {busy ? "Recording…" : "Confirm sale & reserve places"}
            </button>
          </div>
        </div>}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
