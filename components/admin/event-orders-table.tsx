"use client";

import { useState } from "react";
import { CheckCircle2, RotateCcw, TriangleAlert } from "lucide-react";
import AppCoreRefundButton from "@/components/admin/app-core-refund-button";
import InStoreConfirmation from "@/components/admin/in-store-confirmation";
import type { InStoreConfirmationStatus } from "@/lib/app-core/in-store-confirmation";
import InStoreRefundButton from "@/components/admin/in-store-refund-button";
import { formatLondonDateTime } from "@/lib/time/london";

type Line = {
  id: string;
  item_name: string;
  quantity: number;
  unit_amount_pence: number;
  refunded_quantity: number;
  refunded_amount_pence: number;
  eventTitle: string;
  eventStartsAt: string | null;
  ticketName: string;
};

type Order = {
  id: string;
  created_at: string;
  total_pence: number;
  refunded_total_pence: number;
  refund_status: string;
  customerName: string;
  customerEmail: string;
  sumup: { reference: string; saleDate: string; confirmation: InStoreConfirmationStatus } | null;
  lines: Line[];
};

function StatusIcon({ status }: { status: string }) {
  if (status === "full") {
    return <span title="Fully refunded" aria-label="Fully refunded" className="inline-flex rounded-full bg-red-100 p-2 text-red-700"><RotateCcw size={16} aria-hidden="true" /></span>;
  }
  if (status === "partial") {
    return <span title="Partially refunded" aria-label="Partially refunded" className="inline-flex rounded-full bg-amber-100 p-2 text-amber-800"><TriangleAlert size={16} aria-hidden="true" /></span>;
  }
  return <span title="Paid" aria-label="Paid" className="inline-flex rounded-full bg-emerald-100 p-2 text-emerald-700"><CheckCircle2 size={16} aria-hidden="true" /></span>;
}

export default function EventOrdersTable({ orders, canRecord }: { orders: Order[]; canRecord: boolean }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-[#F3ECE5] text-xs uppercase tracking-wide text-neutral-600">
            <tr>
              <th className="px-5 py-3">Order</th><th className="px-5 py-3">Customer</th><th className="px-5 py-3">Purchased</th><th className="px-5 py-3">Total</th><th className="px-5 py-3">Refunded</th><th className="px-5 py-3">Net</th><th className="px-5 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => {
              const isOpen = expanded === order.id;
              const refunded = Number(order.refunded_total_pence ?? 0);
              const net = Math.max(0, Number(order.total_pence) - refunded);
              const eventCount = order.lines.length;
              const ticketCount = order.lines.reduce((sum, line) => sum + Math.max(0, line.quantity - Number(line.refunded_quantity ?? 0)), 0);
              const toggle = () => setExpanded(isOpen ? null : order.id);
              return [
                <tr
                  key={`${order.id}-summary`}
                  tabIndex={0}
                  role="button"
                  aria-expanded={isOpen}
                  onClick={toggle}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      toggle();
                    }
                  }}
                  className={`border-t align-top cursor-pointer transition-colors hover:bg-[#189458]/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#189458] ${isOpen ? "bg-[#189458]/5" : ""}`}
                >
                  <td className="px-5 py-4"><p className="font-mono text-xs font-semibold">{order.id.slice(0, 8)}</p><p className="mt-1 text-xs text-neutral-500">{order.sumup ? formatLondonDateTime(order.sumup.saleDate, { dateStyle: "medium" }) : new Date(order.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</p></td>
                  <td className="px-5 py-4"><p className="font-medium">{order.customerName}</p><p className="text-xs text-neutral-500">{order.customerEmail}</p></td>
                  <td className="px-5 py-4"><p>{eventCount} event{eventCount === 1 ? "" : "s"}</p><p className="text-xs text-neutral-500">{ticketCount} active ticket{ticketCount === 1 ? "" : "s"}</p></td>
                  <td className="px-5 py-4 font-medium">£{(order.total_pence / 100).toFixed(2)}</td>
                  <td className="px-5 py-4 text-red-700">{refunded > 0 ? `£${(refunded / 100).toFixed(2)}` : "—"}</td>
                  <td className="px-5 py-4 font-semibold">£{(net / 100).toFixed(2)}</td>
                  <td className="px-5 py-4"><StatusIcon status={order.refund_status} />{order.sumup ? <span className="ml-2 text-xs font-semibold text-amber-800">SumUp</span> : null}</td>
                </tr>,
                isOpen ? <tr key={`${order.id}-detail`} className="border-t bg-[#FBF8F4]"><td colSpan={7} className="px-5 py-5">
                  <div className="flex flex-col gap-5">
                    {order.sumup ? <InStoreConfirmation orderId={order.id} status={order.sumup.confirmation} canRecord={canRecord} /> : null}
                    <div className="flex flex-wrap items-start justify-between gap-4"><div><h3 className="text-base font-semibold">Items in order {order.id.slice(0, 8)}</h3><p className="mt-1 text-xs text-neutral-500">{order.sumup ? "SumUp payment — refund in POS first, then record it here." : "Purchased event and ticket details. Stripe refunds require explicit confirmation."}</p>{order.sumup ? <div className="mt-2 rounded-lg bg-amber-50 p-3 text-xs"><p><strong>Original SumUp reference:</strong> {order.sumup.reference}</p><p><strong>Date of sale:</strong> {order.sumup.saleDate}</p><p><strong>Email for POS lookup:</strong> {order.customerEmail}</p></div> : null}</div>{order.sumup ? (ticketCount > 0 ? <InStoreRefundButton canRecord={canRecord} orderId={order.id} customerEmail={order.customerEmail} paymentReference={order.sumup.reference} saleDate={order.sumup.saleDate} lines={order.lines.map((line) => ({ id: line.id, name: line.ticketName, unitAmountPence: line.unit_amount_pence, remainingQuantity: Math.max(0, line.quantity - line.refunded_quantity) }))} /> : null) : net > 0 ? <AppCoreRefundButton scope="order" orderId={order.id} label="Refund remaining order" itemName={`Order ${order.id.slice(0, 8)}`} amountPence={net} /> : null}</div>
                    <div className="grid gap-3">
                      {order.lines.map((line) => {
                        const refundedQty = Number(line.refunded_quantity ?? 0);
                        const remainingQty = Math.max(0, Number(line.quantity) - refundedQty);
                        const gross = Number(line.quantity) * Number(line.unit_amount_pence);
                        const lineRefunded = Number(line.refunded_amount_pence ?? 0);
                        const lineNet = Math.max(0, gross - lineRefunded);
                        return <div key={line.id} className="rounded-xl border bg-white p-4"><div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                          <div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{line.eventTitle}</p>{remainingQty === 0 ? <span title="Refunded" aria-label="Refunded" className="inline-flex rounded-full bg-red-100 p-1.5 text-red-700"><RotateCcw size={14} aria-hidden="true" /></span> : refundedQty > 0 ? <span title="Partially refunded" aria-label="Partially refunded" className="inline-flex rounded-full bg-amber-100 p-1.5 text-amber-800"><TriangleAlert size={14} aria-hidden="true" /></span> : <span title="Paid" aria-label="Paid" className="inline-flex rounded-full bg-emerald-100 p-1.5 text-emerald-700"><CheckCircle2 size={14} aria-hidden="true" /></span>}</div>{line.eventStartsAt ? <p className="mt-1 text-xs text-neutral-500">{formatLondonDateTime(line.eventStartsAt, { dateStyle: "medium", timeStyle: "short" })}</p> : null}<p className="mt-1 text-sm text-neutral-700">{line.ticketName} × {line.quantity}</p><p className="mt-1 text-xs text-neutral-500">{remainingQty} active · {refundedQty} refunded</p><p className="mt-1 text-xs text-neutral-500">Original £{(gross / 100).toFixed(2)}{lineRefunded > 0 ? ` · Refunded £${(lineRefunded / 100).toFixed(2)} · Net £${(lineNet / 100).toFixed(2)}` : ""}</p></div>
                          <div className="shrink-0">{order.sumup ? <span className="text-xs text-neutral-500">Refund using the SumUp order control above</span> : <AppCoreRefundButton scope="order_line" orderId={order.id} orderLineId={line.id} label={remainingQty === 0 ? "Already refunded" : remainingQty > 1 ? "Refund ticket(s)" : "Refund ticket"} itemName={line.eventTitle} amountPence={lineNet} unitAmountPence={line.unit_amount_pence} maxQuantity={remainingQty} disabled={remainingQty === 0} />}</div>
                        </div></div>;
                      })}
                    </div>
                  </div>
                </td></tr> : null,
              ];
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
