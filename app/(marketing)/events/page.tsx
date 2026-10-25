import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Events and workshops in Rossington, Doncaster",
  description: "Discover upcoming bookish events, creative workshops and community gatherings at Pages & Peace in Rossington, Doncaster.",
  alternates: { canonical: "https://pagesandpeace.co.uk/events" },
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { formatLondonDateTime } from "@/lib/time/london";
import { listPublishedEvents } from "@/lib/app-core/events";
import { listPublicEventSeries } from "@/lib/app-core/event-series";
import MarketingSignup from "@/components/MarketingSignup";

function formatDate(value: string) {
  return formatLondonDateTime(value, {
    weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default async function EventsPage() {
  const [events, series] = await Promise.all([
    listPublishedEvents(),
    listPublicEventSeries(),
  ]);

  const upcomingSeriesIds = new Set(
    events.map((event) => event.series_id).filter((id): id is string => Boolean(id)),
  );
  const activeSeries = series.filter((item) => upcomingSeriesIds.has(item.id));

  return (
    <main className="min-h-screen bg-background">
      <section className="bg-gradient-to-b from-background to-[#f5efe9] px-6 py-20 text-center">
        <h1 className="text-4xl font-extrabold tracking-tight text-[#111]">
          Events at Pages &amp; Peace
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-neutral-600">
          Discover book clubs, creative workshops and community evenings in Rossington, Doncaster. Browse what’s coming up and book directly with Pages &amp; Peace.
        </p>
      </section>

      <section className="mx-auto max-w-7xl px-6 pt-10">
        {activeSeries.length > 0 ? (
          <div className="rounded-2xl border border-black/10 bg-[#f8f5f1] p-5 sm:p-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.18em] text-neutral-500">Returning favourite?</p>
              <h2 className="mt-1 text-2xl font-bold text-neutral-950">Browse event series</h2>
              <p className="mt-1 text-sm text-neutral-600">See all available dates for the events you already know and love.</p>
            </div>
            <div className="mt-5 flex gap-3 overflow-x-auto pb-1">
              {activeSeries.map((item) => (
                <Link
                  key={item.id}
                  href={`/events/${item.slug}`}
                  className="shrink-0 rounded-full border border-black/10 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-900 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  {item.name} <span aria-hidden="true">→</span>
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section className="mx-auto max-w-7xl px-6 py-12">
        {events.length === 0 ? (
          <p className="text-center text-neutral-600">No upcoming events scheduled.</p>
        ) : (
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((event) => (
              <article key={event.id} className="overflow-hidden rounded-2xl border bg-white shadow-sm">
                {event.image_url && (
                  <img src={event.image_url} alt="" className="h-52 w-full object-cover" />
                )}
                <div className="space-y-3 p-6">
                  <p className="text-sm text-neutral-600">{formatDate(event.starts_at)}</p>
                  <h2 className="text-2xl font-bold text-neutral-950">{event.title}</h2>
                  {event.short_description && (
                    <p className="text-neutral-700">{event.short_description}</p>
                  )}
                  <p className="text-sm font-medium text-neutral-700">
                    {event.remaining_seats > 0
                      ? `${event.remaining_seats} places remaining`
                      : "Sold out"}
                  </p>
                  <Link
                    href={`/events/${event.slug}`}
                    className="inline-flex rounded-md bg-neutral-950 px-4 py-2 font-semibold text-white"
                  >
                    View event
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      <section className="mx-auto max-w-7xl px-6 pb-16">
        <div className="rounded-2xl bg-[#f8f5f1] p-7 sm:p-10">
          <h2 className="text-3xl font-bold text-neutral-950">Book clubs and community events near Doncaster</h2>
          <p className="mt-4 max-w-3xl leading-7 text-neutral-700">Looking for a book club, a creative evening or something different to do locally? Pages &amp; Peace is an independent café and bookshop in Rossington, Doncaster, where books and community come together. Our programme changes throughout the year, so the event listings above are the best place to find confirmed dates and available places.</p>
          <div className="mt-7 grid gap-5 md:grid-cols-2">
            <div><h3 className="text-lg font-semibold text-neutral-950">Find your reading community</h3><p className="mt-2 leading-7 text-neutral-700">Our bookish gatherings offer a reason to make time for reading and meet others who enjoy it. Explore the current programme to see which clubs have upcoming dates.</p></div>
            <div><h3 className="text-lg font-semibold text-neutral-950">Try a workshop or social evening</h3><p className="mt-2 leading-7 text-neutral-700">From creative sessions to community get-togethers, the events calendar is a simple way to discover something new in Rossington.</p></div>
          </div>
          <p className="mt-6 text-neutral-700">Visiting for the first time? <Link href="/visit" className="font-semibold underline underline-offset-4">Find our address and opening hours</Link>, or <Link href="/menu" className="font-semibold underline underline-offset-4">browse the café menu</Link> before you come.</p>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-6 pb-16">
        <MarketingSignup />
      </section>
    </main>
  );
}
