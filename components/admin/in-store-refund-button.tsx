"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  orderId: string; orderLineId: string; itemName: string;
  customerEmail: string; paymentReference: string; paidAt: string;
  unitAmountPence: number; maxQuantity: number;
};
export default function InStoreRefundButton({ orderId, orderLineId, itemName, customerEmail, paymentReference, paidAt, unitAmountPence, maxQuantity }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [quantity, setQuantity] = useState(maxQuantity);
  const [reference, setReference] = useState("");
  const [refundDate, setRefundDate] = useState(() => {
    const now = new Date(); return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  });
  const [reason, setReason] = useState("Customer requested");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const amount = quantity * unitAmountPence;

  async function save() {
    if (busy || !confirmed) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/app-core/admin/in-store-refunds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId, orderLineId, quantity, refundReference: reference.trim(),
          refundDate: new Date(refundDate).toISOString(), reason, confirmedExternalRefund: confirmed,
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) throw new Error(result?.error ?? "Could not record SumUp refund");
      setOpen(false);
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to record refund"); }
    finally { setBusy(false); }
  }

  return <>
    <button type="button" disabled={maxQuantity < 1} onClick={() => { setQuantity(maxQuantity); setConfirmed(false); setError(""); setOpen(true); }}
      className="rounded-full border border-amber-400 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-50 disabled:opacity-40">
      Record SumUp refund
    </button>
    {open ? <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-3">
      <div role="dialog" aria-modal="true" aria-label="Record completed SumUp refund"
        className="max-h-[92dvh] w-full max-w-lg space-y-4 overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
        <h2 className="text-xl font-semibold">Record SumUp refund</h2>
        <p className="text-sm text-amber-900">First refund the customer in SumUp. This screen only records a completed external refund and restores the related ticket capacity.</p>
        <div className="rounded-lg border bg-stone-50 p-3 text-sm">
          <p><strong>Ticket:</strong> {itemName}</p>
          <p><strong>Customer email:</strong> {customerEmail || "—"}</p>
          <p><strong>Original payment:</strong> {new Date(paidAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</p>
          <p className="break-all"><strong>SumUp sale reference:</strong> {paymentReference} <button type="button" onClick={() => navigator.clipboard.writeText(paymentReference)} className="ml-2 underline">Copy</button></p>
        </div>
        <label className="block text-sm font-medium">Tickets refunded
          <select value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} className="mt-1 w-full rounded-lg border p-3">
            {Array.from({ length: maxQuantity }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <p className="font-semibold">Amount to reconcile: £{(amount / 100).toFixed(2)}</p>
        <label className="block text-sm font-medium">SumUp refund reference
          <input value={reference} onChange={(e) => setReference(e.target.value)} className="mt-1 w-full rounded-lg border p-3" placeholder="From completed SumUp refund"/>
        </label>
        <label className="block text-sm font-medium">SumUp refund date/time
          <input type="datetime-local" value={refundDate} onChange={(e) => setRefundDate(e.target.value)} className="mt-1 w-full rounded-lg border p-3"/>
        </label>
        <label className="block text-sm font-medium">Reason
          <input value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 w-full rounded-lg border p-3"/>
        </label>
        <label className="flex items-start gap-2 text-sm font-semibold"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-1"/>
          I have completed and verified this £{(amount / 100).toFixed(2)} refund in SumUp.
        </label>
        {error ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" disabled={busy} onClick={() => setOpen(false)} className="rounded-lg border px-4 py-2">Cancel</button>
          <button type="button" disabled={busy || !confirmed || reference.trim().length < 3 || !refundDate}
            onClick={save} className="rounded-lg bg-amber-800 px-4 py-2 font-semibold text-white disabled:opacity-40">
            {busy ? "Saving…" : "Confirm refund was completed"}
          </button>
        </div>
      </div>
    </div> : null}
  </>;
}
