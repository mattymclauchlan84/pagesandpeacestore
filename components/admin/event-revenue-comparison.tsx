"use client";

import { useState } from "react";

import type { EventRevenueMonth } from "@/lib/app-core/event-revenue-trend";

const currency = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const money = (pence: number) => currency.format(pence / 100);

export default function EventRevenueComparison({ months }: { months: EventRevenueMonth[] }) {
  const [selection, setSelection] = useState<string>();
  const selected = months.find((month) => month.key === selection) ?? months[months.length - 1];
  const highest = Math.max(1, ...months.map((month) => Math.max(month.current, month.previous)));
  const difference = selected.current - selected.previous;

  return (
    <section className="min-w-0 rounded-2xl border bg-white p-4 sm:p-6">
      <h2 className="text-xl font-bold">Monthly event revenue</h2>
      <p className="mt-1 text-sm text-foreground/65">Net of refunds, grouped by sale month. Select a month for exact figures.</p>

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-foreground/75">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-emerald-700" /> Latest 12 months</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm border border-emerald-700 bg-emerald-100" /> Same months a year earlier</span>
      </div>

      <div className="relative mt-3" role="group" aria-label="Select a month to compare event revenue">
        <div className="pointer-events-none absolute inset-x-0 top-14 h-14 border-y border-neutral-200 sm:top-20 sm:h-20" aria-hidden="true" />
        <div className="relative grid grid-cols-12">
          {months.map((month) => (
            <button key={month.key} type="button" onClick={() => setSelection(month.key)}
              aria-pressed={selected.key === month.key}
              aria-label={`${month.name} ${month.year}${month.inProgress ? " so far" : ""}, ${money(month.current)}. ${month.name} ${month.year - 1}, ${money(month.previous)}.`}
              className="min-w-0 rounded-sm outline-offset-[-2px] hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-emerald-700 aria-pressed:bg-emerald-50">
              <span aria-hidden="true" className="mx-auto flex h-28 w-full max-w-12 items-end justify-center gap-px px-0.5 sm:h-40 sm:gap-1 sm:px-1">
                <span className="w-1/2 rounded-t-sm bg-emerald-700" style={{ height: `${month.current / highest * 100}%` }} />
                <span className={`w-1/2 rounded-t-sm bg-emerald-100 ${month.previous ? "border border-b-0 border-emerald-700" : ""}`} style={{ height: `${month.previous / highest * 100}%` }} />
              </span>
              <span aria-hidden="true" className="block border-t border-neutral-300 py-2 text-[9px] font-medium text-neutral-800 sm:text-xs">{month.name.slice(0, 3)}</span>
            </button>
          ))}
        </div>
      </div>

      <div aria-live="polite" className="mt-3 rounded-xl bg-stone-50 p-3 sm:flex sm:items-end sm:justify-between sm:gap-4">
        <dl className="grid grid-cols-2 gap-2 sm:gap-8">
          <div>
            <dt className="text-xs text-neutral-700">{selected.name} {selected.year}{selected.inProgress ? " so far" : ""}</dt>
            <dd className="text-lg font-semibold">{money(selected.current)}</dd>
          </div>
          <div>
            <dt className="text-xs text-neutral-700">{selected.name} {selected.year - 1}</dt>
            <dd className="text-lg font-semibold">{money(selected.previous)}</dd>
          </div>
        </dl>
        {!selected.inProgress ? <p className="mt-2 text-xs text-neutral-700 sm:mt-0">
          {difference === 0 ? "No change from last year" : `${money(Math.abs(difference))} ${difference > 0 ? "higher" : "lower"} than last year`}
        </p> : null}
      </div>
    </section>
  );
}
