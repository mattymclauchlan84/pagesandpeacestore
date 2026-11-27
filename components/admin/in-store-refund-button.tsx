"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Line = { id: string; name: string; unitAmountPence: number; remainingQuantity: number };
type Props = { orderId: string; lines: Line[]; customerEmail: string; paymentReference: string; paidAt: string };
export default function InStoreRefundButton({ orderId, lines, customerEmail, paymentReference, paidAt }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [reference, setReference] = useState("");
  const [refundDate, setRefundDate] = useState(() => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  });
  const [reason, setReason] = useState("Customer requested");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selected = lines.filter((line) => (quantities[line.id] ?? 0) > 0);
  const amount = selected.reduce((sum, line) => sum + (quantities[line.id] ?? 0) * line.unitAmountPence, 0);
  const canSave = !busy && confirmed && selected.length > 0 && reference.trim().length >= 3 && !!refundDate;

  async function save() {
    if (!canSave) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/app-core/admin/in-store-refunds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId, items: selected.map((line) => ({ orderLineId: line.id, quantity: quantities[line.id] })),
          refundReference: reference.trim(), refundDate: new Date(refundDate).toISOString(),
          reason, confirmedExternalRefund: confirmed,
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) throw new Error(result?.error ?? "Could not record refund");
      setOpen(false); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to record refund"); }
    finally { setBusy(false); }
  }
  return <>
    <button type="button" disabled={!lines.some((line) => line.remainingQuantity > 0)}
      onClick={() => { setQuantities({}); setReference(""); setConfirmed(false); setError(""); setOpen(true); }}
      className="rounded-full border border-amber-400 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-50 disabled:opacity-40">
      Record SumUp refund
    </button>
    {open ? <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-3">
      <div role="dialog" aria-modal="true" aria-label="Record completed SumUp refund"
        className="max-h-[92dvh] w-full max-w-lg space-y-4 overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
        <h2 className="text-xl font-semibold">Record SumUp refund</h2>
        <p className="text-sm text-amber-900">First refund the customer in SumUp. Then record the completed transaction here. Capacity returns only after confirmation.</p>
        <div className="rounded-lg border bg-stone-50 p-3 text-sm">
          <p><strong>Customer email:</strong> {customerEmail || "—"}</p>
          <p><strong>Original payment:</strong> {new Date(paidAt).toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "medium", timeStyle: "short" })}</p>
          <p className="break-all"><strong>Original SumUp reference:</strong> {paymentReference} <button type="button" onClick={() => navigator.clipboard.writeText(paymentReference)} className="ml-2 underline">Copy</button></p>
        </div>
        <div className="rounded-lg border p-3">
          <h3 className="font-semibold">Tickets included in this refund</h3>
          {lines.map((line) => <label key={line.id} className="mt-3 flex items-center justify-between gap-3 text-sm">
            <span>{line.name}<span className="block text-xs text-neutral-500">{line.remainingQuantity} active · £{(line.unitAmountPence / 100).toFixed(2)} each</span></span>
            <select value={quantities[line.id] ?? 0}
              onChange={(e) => setQuantities((prev) => ({ ...prev, [line.id]: Number(e.target.value) }))}
              aria-label={"Refund quantity for " + line.name} className="rounded-lg border p-2">
              {Array.from({ length: line.remainingQuantity + 1 }, (_, i) => i).map((q) => <option key={q} value={q}>{q}</option>)}
            </select>
          </label>)}
        </div>
        <p className="font-semibold">Amount refunded in SumUp: £{(amount / 100).toFixed(2)}</p>
        <label className="block text-sm font-medium">SumUp refund reference
          <input value={reference} onChange={(e) => setReference(e.target.value)} className="mt-1 w-full rounded-lg border p-3" placeholder="From completed SumUp refund"/>
        </label>
        <label className="block text-sm font-medium">SumUp refund date/time
          <input type="datetime-local" value={refundDate} onChange={(e) => setRefundDate(e.target.value)} className="mt-1 w-full rounded-lg border p-3"/>
        </label>
        <label className="block text-sm font-medium">Reason
          <input value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 w-full rounded-lg border p-3"/>
        </label>
        <p className="text-xs text-amber-800">For events requiring adults to accompany children, an adult ticket must remain unless the remaining child tickets are also refunded.</p>
        <label className="flex items-start gap-2 text-sm font-semibold"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-1"/>
          I have completed and verified this £{(amount / 100).toFixed(2)} refund in SumUp.
        </label>
        {error ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" disabled={busy} onClick={() => setOpen(false)} className="rounded-lg border px-4 py-2">Cancel</button>
          <button type="button" disabled={!canSave} onClick={save} className="rounded-lg bg-amber-800 px-4 py-2 font-semibold text-white disabled:opacity-40">
            {busy ? "Saving…" : "Confirm external refund"}
          </button>
        </div>
      </div>
    </div> : null}
  </>;
}
