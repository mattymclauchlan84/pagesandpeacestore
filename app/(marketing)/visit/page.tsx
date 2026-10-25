import type { Metadata } from "next";
import Link from "next/link";
import MarketingSignup from "@/components/MarketingSignup";
import OpeningHours from "@/components/OpeningHours";

export const metadata: Metadata = {
  title: "Visit our bookshop café in Rossington, Doncaster",
  description: "Plan a visit to Pages & Peace: an independent bookshop, café and event space at 8 Eva Building, Kings Avenue, Rossington, Doncaster.",
  alternates: { canonical: "https://pagesandpeace.co.uk/visit" },
};


export default function VisitPage() {
  return <main className="min-h-screen bg-[#f8f5f1] text-[#17221f]">
    <section className="mx-auto max-w-5xl px-6 py-16 sm:py-24">
      <p className="text-xs font-semibold uppercase tracking-[.24em] text-[#477460]">Visit Pages &amp; Peace</p>
      <h1 className="mt-4 max-w-3xl font-serif text-5xl leading-[.98] tracking-[-.04em] sm:text-6xl">A bookshop café in the heart of Rossington.</h1>
      <p className="mt-7 max-w-2xl text-lg leading-8 text-[#40514a]">Come for a thoughtfully chosen book, a good coffee, or an evening that brings people together. You’ll find us in Rossington, Doncaster.</p>
      <div className="mt-10 flex flex-wrap gap-3"><Link href="/events" className="rounded-full bg-[#17221f] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#477460]">See what’s on</Link><a href="https://www.google.com/maps/search/?api=1&query=8+Eva+Building+Kings+Avenue+Rossington+Doncaster+DN11+0PF" target="_blank" rel="noreferrer" className="rounded-full border border-[#17221f] px-6 py-3 text-sm font-semibold transition hover:bg-white">Get directions</a></div>
    </section>
    <section className="mx-auto grid max-w-5xl gap-6 px-6 pb-16 md:grid-cols-2">
      <article className="rounded-[2rem] bg-white p-8 shadow-sm"><h2 className="font-serif text-3xl">Find us</h2><address className="mt-5 not-italic leading-7 text-[#40514a]">Pages &amp; Peace Coffee + Bookshop<br />8 Eva Building<br />Kings Avenue<br />Rossington, Doncaster<br />DN11 0PF</address><a href="tel:07395266100" className="mt-6 inline-block font-semibold underline underline-offset-4">Call 07395 266100</a><p className="mt-4"><a href="mailto:admin@pagesandpeace.co.uk" className="font-semibold underline underline-offset-4">admin@pagesandpeace.co.uk</a></p></article>
      <article className="rounded-[2rem] bg-[#f1e2d6] p-8"><h2 className="font-serif text-3xl">Opening hours</h2><div className="mt-5 text-[#40514a]"><OpeningHours /></div><p className="mt-6 text-sm leading-6 text-[#40514a]">Updated from our current shop hours. Hours can change for special events or holidays.</p></article>
    </section>
    <section className="mx-auto max-w-5xl px-6 pb-16">
      <div className="grid gap-6 md:grid-cols-2">
        <article className="rounded-[2rem] bg-white p-8 shadow-sm">
          <h2 className="font-serif text-3xl">Coffee, books and a little time to yourself</h2>
          <p className="mt-4 leading-7 text-[#40514a]">Pages &amp; Peace brings an independent bookshop and a welcoming café together in Rossington. Browse the shelves, meet a friend for a coffee or settle in with your next read.</p>
          <p className="mt-4 leading-7 text-[#40514a]">Our café serves drinks, simple food and sweet treats. See the current menu before your visit.</p>
          <Link href="/menu" className="mt-5 inline-block font-semibold underline underline-offset-4">Explore the café menu</Link>
        </article>
        <article className="rounded-[2rem] bg-[#dfebe6] p-8">
          <h2 className="font-serif text-3xl">More than a bookshop</h2>
          <p className="mt-4 leading-7 text-[#40514a]">We host bookish gatherings, creative workshops and community evenings. Whether you come on your own or with friends, our events are a way to find something new to enjoy locally.</p>
          <Link href="/events" className="mt-5 inline-block font-semibold underline underline-offset-4">Browse upcoming events and book your place</Link>
        </article>
      </div>
      <div className="mt-10 rounded-[2rem] bg-white p-8 shadow-sm">
        <h2 className="font-serif text-3xl">Planning your visit</h2>
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <div><h3 className="font-semibold">Where is Pages &amp; Peace?</h3><p className="mt-2 leading-7 text-[#40514a]">Find us at 8 Eva Building, Kings Avenue, Rossington, Doncaster DN11 0PF. Use the directions link above to plan your journey.</p></div>
          <div><h3 className="font-semibold">Can I come just for coffee?</h3><p className="mt-2 leading-7 text-[#40514a]">Of course. Pop in for a drink or something to eat, even if you are not shopping for books or attending an event.</p></div>
          <div><h3 className="font-semibold">Do I need to book?</h3><p className="mt-2 leading-7 text-[#40514a]">You can visit the café and bookshop without an event ticket. For ticketed workshops and evenings, check the event page for booking details.</p></div>
          <div><h3 className="font-semibold">When are you open?</h3><p className="mt-2 leading-7 text-[#40514a]">Our current opening hours are shown above. Check them before travelling, particularly around holidays and special events.</p></div>
        </div>
      </div>
    </section>
    <section className="mx-auto max-w-5xl px-6 pb-20"><MarketingSignup /></section>
  </main>;
}
