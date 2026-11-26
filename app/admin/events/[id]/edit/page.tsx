import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DeleteEventButton } from "@/components/app-core/delete-event-button";
import { EventAdminForm } from "@/components/app-core/event-admin-form";
import { EventTicketOptionsEditor } from "@/components/app-core/event-ticket-options-editor";
import { readCapacity, readEventField as read, readTicketOptions, ticketSaveError } from "@/lib/app-core/admin-event-tickets";
import { EventImageUpload } from "@/components/app-core/event-image-upload";
import { appCoreDb } from "@/lib/app-core/service";
import { requireAdminUser } from "@/lib/auth/require-admin-user";
import { parseLondonDateTimeInput, toLondonDateTimeInput } from "@/lib/time/london";

const dateInput = toLondonDateTimeInput;
type Props = { params: Promise<{ id: string }> };

export default async function EditEventPage({ params }: Props) {
  const { id } = await params;
  const admin = await requireAdminUser();
  if (!admin) redirect(`/sign-in?callbackURL=/admin/events/${id}/edit`);

  const db = appCoreDb();
  const [{ data: event, error }, { data: tickets, error: ticketError }] = await Promise.all([
    db.from("events").select("id,title,series_name,subtitle,short_description,description,starts_at,ends_at,capacity,image_url,status").eq("id", id).maybeSingle(),
    db.from("ticket_types").select("id,name,description,price_pence,capacity,is_active").eq("event_id", id).order("created_at").order("id"),
  ]);
  if (error || ticketError) throw new Error("Unable to load this event.");
  if (!event) notFound();
  const { data: seriesRows, error: seriesError } = await db.from("events").select("series_name").not("series_name", "is", null).order("series_name");
  if (seriesError) throw new Error("Unable to load event series.");
  const seriesOptions = [...new Set((seriesRows ?? []).map((row) => row.series_name).filter((name): name is string => Boolean(name)))];

  async function save(_previous: string | null, formData: FormData): Promise<string | null> {
    "use server";
    if (!await requireAdminUser()) redirect(`/sign-in?callbackURL=/admin/events/${id}/edit`);
    const title = read(formData, "title");
    const description = read(formData, "description");
    const date = parseLondonDateTimeInput(read(formData, "starts_at"));
    const endInput = read(formData, "ends_at");
    const endDate = endInput ? parseLondonDateTimeInput(endInput) : null;
    const capacity = readCapacity(read(formData, "capacity"));
    const requestedStatus = read(formData, "status");
    const status = ["draft", "published", "cancelled", "archived"].includes(requestedStatus) ? requestedStatus : "draft";
    if (!title || !description || Number.isNaN(date.getTime()) || (endDate && (Number.isNaN(endDate.getTime()) || endDate <= date)) || capacity === null) {
      return "Please complete valid event details.";
    }
    const options = readTicketOptions(formData);
    if (!options) return "Enter a valid name and price for each ticket option.";

    const { error: updateError } = await appCoreDb().rpc("save_event_ticket_options", {
      p_event_id: id,
      p_event: {
        title, description, capacity, status, starts_at: date.toISOString(), ends_at: endDate?.toISOString() ?? null,
        series_name: read(formData, "series_name") || null,
        subtitle: read(formData, "subtitle") || null,
        short_description: read(formData, "short_description") || null,
        image_url: read(formData, "image_url") || null,
      },
      p_tickets: options,
      p_create: false,
    });
    if (updateError) return ticketSaveError(updateError);
    redirect("/admin/events");
  }

  async function remove() {
    "use server";
    if (!await requireAdminUser()) redirect(`/sign-in?callbackURL=/admin/events/${id}/edit`);
    const service = appCoreDb();
    const { error: bookingError } = await service.from("bookings").select("id", { count: "exact", head: true }).eq("event_id", id);
    if (bookingError) throw new Error("Unable to check event history.");
    const { error: archiveError } = await service.from("events").update({ status: "archived" }).eq("id", id);
    if (archiveError) throw new Error("Unable to archive this event.");
    redirect("/admin/events");
  }

  return <main className="mx-auto max-w-3xl px-6 py-10">
    <Link href="/admin/events" className="text-sm underline underline-offset-4">← Events</Link>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><h1 className="text-3xl font-bold tracking-tight">Edit event</h1><Link href={`/admin/events/new?duplicate=${event.id}`} className="rounded-lg border border-black/15 px-4 py-2 text-sm font-semibold">Duplicate event</Link></div>
    <EventAdminForm action={save} submitLabel="Save changes">
      <label className="block text-sm font-medium">Title<input name="title" required defaultValue={event.title} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" /></label>
      <label className="block text-sm font-medium">Event series (optional)<input name="series_name" list="event-series-options" defaultValue={event.series_name ?? ""} placeholder="Choose an existing series or create one" className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" /><datalist id="event-series-options">{seriesOptions.map((series) => <option key={series} value={series} />)}</datalist><p className="mt-1 text-xs font-normal text-foreground/60">Choose a saved series or type a new one.</p></label>
      <label className="block text-sm font-medium">Subtitle<input name="subtitle" defaultValue={event.subtitle ?? ""} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" /></label>
      <label className="block text-sm font-medium">Short description<textarea name="short_description" rows={2} defaultValue={event.short_description ?? ""} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" /></label>
      <label className="block text-sm font-medium">Full description<textarea name="description" required rows={6} defaultValue={event.description} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" /></label>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block text-sm font-medium">Start date and time<input name="starts_at" type="datetime-local" required defaultValue={dateInput(event.starts_at)} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" /></label>
        <label className="block text-sm font-medium">End date and time<input name="ends_at" type="datetime-local" defaultValue={event.ends_at ? dateInput(event.ends_at) : ""} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" /></label>
        <label className="block text-sm font-medium">Total capacity<input name="capacity" type="number" min="0" required defaultValue={event.capacity} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" /></label>
      </div>
      <div><p className="text-sm font-medium">Event image</p><div className="mt-1"><EventImageUpload initialUrl={event.image_url} /></div></div>
      <label className="block text-sm font-medium">Visibility<select name="status" defaultValue={event.status} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal"><option value="draft">Draft — private</option><option value="published">Published — public</option><option value="cancelled">Cancelled — not for sale</option><option value="archived">Archived — removed from sale</option></select></label>
      <EventTicketOptionsEditor initialOptions={tickets ?? []} />
    </EventAdminForm>
    <form action={remove} className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-6">
      <h2 className="font-semibold text-red-900">Archive event</h2>
      <p className="mt-1 text-sm text-red-800">Archiving removes this event from public sale while preserving all history and avoids permanent data loss.</p>
      <div className="mt-4"><DeleteEventButton /></div>
    </form>
  </main>;
}