import Link from "next/link";
import { redirect } from "next/navigation";

import { appCoreDb } from "@/lib/app-core/service";
import { requireAdminUser } from "@/lib/auth/require-admin-user";
import { EventAdminForm } from "@/components/app-core/event-admin-form";
import { EventTicketOptionsEditor } from "@/components/app-core/event-ticket-options-editor";
import { isEventUuid, readCapacity, readEventField as value, readTicketOptions, ticketSaveError } from "@/lib/app-core/admin-event-tickets";
import { EventImageUpload } from "@/components/app-core/event-image-upload";
import { EventSeriesTemplateSelector, type EventSeriesTemplate } from "@/components/app-core/event-series-template-selector";
import { parseLondonDateTimeInput, toLondonDateTimeInput } from "@/lib/time/london";

function slugify(input: string) {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

async function uniqueSlug(title: string) {
  const db = appCoreDb();
  const base = slugify(title) || "event";

  for (let suffix = 0; suffix < 100; suffix += 1) {
    const candidate = suffix === 0 ? base : `${base}-${suffix + 1}`;
    const { data, error } = await db.from("events").select("id").eq("slug", candidate).maybeSingle();
    if (error) throw new Error("Unable to validate event slug");
    if (!data) return candidate;
  }

  throw new Error("Unable to create a unique event link");
}

async function createEvent(_previous: string | null, formData: FormData): Promise<string | null> {
  "use server";

  const admin = await requireAdminUser();
  if (!admin) redirect("/sign-in?callbackURL=/admin/events/new");

  const eventId = value(formData, "event_id");
  if (!isEventUuid(eventId)) return "Unable to create this event. Please refresh and try again.";

  const title = value(formData, "title");
  const description = value(formData, "description");
  const startsAtInput = value(formData, "starts_at");
  const endsAtInput = value(formData, "ends_at");
  const capacity = readCapacity(value(formData, "capacity"));
  const tickets = readTicketOptions(formData);

  if (!title || !description || !startsAtInput || capacity === null || capacity < 1) {
    return "Please complete the required event details.";
  }
  if (!tickets?.length) return "Enter a valid name and price for each ticket option.";

  const startsAt = parseLondonDateTimeInput(startsAtInput);
  const endsAt = endsAtInput ? parseLondonDateTimeInput(endsAtInput) : null;
  if (Number.isNaN(startsAt.getTime()) || (endsAt && (Number.isNaN(endsAt.getTime()) || endsAt <= startsAt))) {
    return "Please provide valid event start and end times.";
  }

  const db = appCoreDb();
  const { data: existingEvent, error: existingError } = await db.from("events").select("id").eq("id", eventId).maybeSingle();
  if (existingError) return "Unable to check the event request. Please try again.";
  if (existingEvent) redirect("/admin/events");

  const { error } = await db.rpc("save_event_ticket_options", {
    p_event_id: eventId,
    p_event: {
      slug: await uniqueSlug(title),
      title,
      series_name: value(formData, "series_name") || null,
      subtitle: value(formData, "subtitle") || null,
      short_description: value(formData, "short_description") || null,
      description,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt?.toISOString() ?? null,
      capacity,
      image_url: value(formData, "image_url") || null,
      status: value(formData, "status") === "published" ? "published" : "draft",
    },
    p_tickets: tickets,
    p_create: true,
  });

  if (error) return ticketSaveError(error);
  redirect("/admin/events");
}

type CreateEventProps = { searchParams: Promise<{ duplicate?: string | string[] }> };

export default async function CreateEventPage({ searchParams }: CreateEventProps) {
  const admin = await requireAdminUser();
  if (!admin) redirect("/sign-in?callbackURL=/admin/events/new");

  const requestedDuplicate = (await searchParams).duplicate;
  const duplicateId = typeof requestedDuplicate === "string" && isEventUuid(requestedDuplicate) ? requestedDuplicate : null;
  const db = appCoreDb();

  const [{ data: seriesRows, error: seriesError }, { data: sourceEvent, error: sourceError }] = await Promise.all([
    db.from("event_series").select("id,name,default_title,default_subtitle,default_short_description,default_description,default_image_url,default_capacity,default_ticket_name,default_ticket_description,default_ticket_price_pence").order("name"),
    duplicateId
      ? db.from("events").select("id,title,series_name,subtitle,short_description,description,starts_at,ends_at,capacity,image_url").eq("id", duplicateId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (seriesError || sourceError) throw new Error("Unable to load event details.");

  const { data: sourceTickets, error: sourceTicketError } = sourceEvent
    ? await db.from("ticket_types").select("name,description,price_pence,capacity,is_active").eq("event_id", sourceEvent.id).eq("is_active", true).order("created_at").order("id")
    : { data: [], error: null };
  if (sourceTicketError) throw new Error("Unable to load event ticket details.");

  const initialOptions = sourceTickets?.length
    ? sourceTickets.map((ticket) => ({ ...ticket, id: crypto.randomUUID() }))
    : [{ id: crypto.randomUUID(), name: "General admission", description: null, price_pence: 0, capacity: null, is_active: !sourceEvent }];
  const templates = (seriesRows ?? []) as EventSeriesTemplate[];

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-8">
        <Link href="/admin/events" className="text-sm underline underline-offset-4">← Events</Link>
        <h1 className="mt-4 text-3xl font-bold tracking-tight">{sourceEvent ? "Duplicate event" : "Create event"}</h1>
        <p className="mt-2 text-foreground/65">
          {sourceEvent
            ? "Choose a new date and review the copied details and ticket options."
            : "Choose a series to load its standard event setup, or create a one-off event from scratch."}
        </p>
      </div>

      <EventAdminForm action={createEvent} submitLabel="Create event">
        <input type="hidden" name="event_id" value={crypto.randomUUID()} />
        <EventSeriesTemplateSelector templates={templates} initialSeriesName={sourceEvent?.series_name} duplicateMode={Boolean(sourceEvent)} />

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Event details</h2>

          <label className="block text-sm font-medium">Title
            <input name="title" required defaultValue={sourceEvent?.title ?? ""} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" />
          </label>

          <label className="block text-sm font-medium">Subtitle
            <input name="subtitle" defaultValue={sourceEvent?.subtitle ?? ""} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" />
          </label>

          <label className="block text-sm font-medium">Short description
            <textarea name="short_description" rows={2} defaultValue={sourceEvent?.short_description ?? ""} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" />
          </label>

          <label className="block text-sm font-medium">Full description
            <textarea name="description" required rows={6} defaultValue={sourceEvent?.description ?? ""} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" />
          </label>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block text-sm font-medium">Start date and time
              <input name="starts_at" type="datetime-local" required defaultValue={sourceEvent ? toLondonDateTimeInput(sourceEvent.starts_at) : ""} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" />
            </label>
            <label className="block text-sm font-medium">End date and time
              <input name="ends_at" type="datetime-local" defaultValue={sourceEvent?.ends_at ? toLondonDateTimeInput(sourceEvent.ends_at) : ""} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" />
            </label>
            <label className="block text-sm font-medium">Total capacity
              <input name="capacity" type="number" min="1" defaultValue={sourceEvent?.capacity ?? 20} required className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" />
            </label>
          </div>

          <div><p className="text-sm font-medium">Event image</p><div className="mt-1"><EventImageUpload initialUrl={sourceEvent?.image_url} /></div></div>

          <label className="block text-sm font-medium">Visibility
            <select name="status" defaultValue="draft" className="mt-1 w-full rounded-lg border px-3 py-2 font-normal">
              <option value="draft">Draft — private</option>
              <option value="published">Published — public</option>
            </select>
          </label>
        </section>

        <EventTicketOptionsEditor initialOptions={initialOptions} isCreating />
      </EventAdminForm>
    </main>
  );
}
