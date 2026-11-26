"use client";

import { useState } from "react";
import type { EventTicketOption } from "@/lib/app-core/admin-event-tickets";

const fieldClass = "mt-1 w-full rounded-lg border px-3 py-2 font-normal";

export function EventTicketOptionsEditor({
  initialOptions,
  isCreating = false,
}: {
  initialOptions: EventTicketOption[];
  isCreating?: boolean;
}) {
  const [options, setOptions] = useState(() =>
    initialOptions.map((ticket) => ({ ...ticket, saved: !isCreating })),
  );

  function addOption() {
    const id = crypto.randomUUID();
    setOptions((current) => [...current, {
      id, name: "", description: null, price_pence: 0, capacity: null, is_active: true, saved: false,
    }]);
  }

  return (
    <section className="space-y-4 border-t pt-6" aria-labelledby="event-ticket-options">
      <h2 id="event-ticket-options" className="text-lg font-semibold">Ticket options</h2>
      <p className="text-sm text-foreground/70">All options share the event’s total capacity. Set an option limit only if you want to sell fewer of that option.</p>
      {options.map((ticket, index) => {
        const suffix = index === 0 ? "" : `_${ticket.id}`;
        return (
          <fieldset key={ticket.id} className="space-y-4 rounded-lg border p-4">
            <legend className="px-1 text-sm font-semibold">{options.length > 1 ? `Option ${index + 1}` : "Ticket details"}</legend>
            <input type="hidden" name="ticket_id" value={ticket.id} />
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium">Ticket name
                <input name={`ticket_name${suffix}`} required defaultValue={ticket.name} className={fieldClass} />
              </label>
              <label className="block text-sm font-medium">Price (£)
                <input name={`ticket_price${suffix}`} type="number" min="0" step="0.01" required defaultValue={(ticket.price_pence / 100).toFixed(2)} className={fieldClass} />
              </label>
            </div>
            <label className="block text-sm font-medium">Description (optional)
              <input name={`ticket_description${suffix}`} defaultValue={ticket.description ?? ""} className={fieldClass} />
            </label>
            <div className="flex flex-wrap items-end gap-4">
              <label className="block text-sm font-medium">Option limit (optional)
                <input name={`ticket_capacity${suffix}`} type="number" min="0" step="1" defaultValue={ticket.capacity ?? ""} placeholder="Shared event capacity" className={fieldClass} />
              </label>
              <label className="flex min-h-10 items-center gap-2 text-sm font-medium">
                <input name={`ticket_active${suffix}`} type="checkbox" defaultChecked={ticket.is_active} /> Available for sale
              </label>
              {!ticket.saved && (!isCreating || options.length > 1) ? (
                <button type="button" className="min-h-10 text-sm underline" onClick={() => setOptions((current) => current.filter((option) => option.id !== ticket.id))}>
                  Remove option
                </button>
              ) : null}
            </div>
          </fieldset>
        );
      })}
      <button type="button" onClick={addOption} className="rounded-lg border px-4 py-2 text-sm font-semibold">Add ticket option</button>
    </section>
  );
}
