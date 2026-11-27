"use client";

import { useState } from "react";

const pageSize = 5;
const currency = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const percent = new Intl.NumberFormat("en-GB", { style: "percent" });
const pageButton = "rounded-lg border px-3 py-2 text-sm font-semibold hover:bg-stone-50 disabled:opacity-40";

type EventTypeRevenue = { name: string; revenue: number; tickets: number };

export default function EventTypeRevenue({ events, totalRevenue }: { events: EventTypeRevenue[]; totalRevenue: number }) {
  const [selectedPage, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(events.length / pageSize));
  const page = Math.min(selectedPage, totalPages);
  const start = (page - 1) * pageSize;
  const visibleEvents = events.slice(start, start + pageSize);
  const highestRevenue = events[0]?.revenue || 1;

  return <section className="rounded-2xl border bg-white p-4 sm:p-6">
    <h2 className="text-xl font-bold">Revenue by event type</h2>
    <p className="mt-1 text-sm text-foreground/65">Ranked by net revenue this trading year.</p>
    {visibleEvents.length ? <ol className="mt-5 space-y-4" start={start + 1}>
      {visibleEvents.map((event) => <li key={event.name}>
        <div className="flex justify-between gap-3 text-sm">
          <span className="min-w-0 break-words font-medium">
            {event.name} <span className="text-foreground/65">· {event.tickets} ticket{event.tickets === 1 ? "" : "s"}</span>
          </span>
          <span className="shrink-0 text-right font-semibold">
            {currency.format(event.revenue / 100)}
            {totalRevenue > 0 ? <span className="ml-2 text-xs font-normal text-foreground/65">{percent.format(event.revenue / totalRevenue)}</span> : null}
          </span>
        </div>
        <div aria-hidden="true" className="mt-2 h-2 overflow-hidden rounded-full bg-[#f1ede7]">
          <div className="h-full rounded-full bg-emerald-700" style={{ width: `${event.revenue / highestRevenue * 100}%` }} />
        </div>
      </li>)}
    </ol> : <p className="mt-5 text-sm text-foreground/65">No paid event revenue this trading year.</p>}
    {totalPages > 1 ? <nav aria-label="Event type revenue pages" className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
      <p aria-live="polite" className="text-sm text-foreground/65">{start + 1}–{start + visibleEvents.length} of {events.length} event types</p>
      <div className="flex gap-2">
        <button type="button" disabled={page === 1} onClick={() => setPage(page - 1)} className={pageButton}>Previous</button>
        <button type="button" disabled={page === totalPages} onClick={() => setPage(page + 1)} className={pageButton}>Next</button>
      </div>
    </nav> : null}
  </section>;
}
