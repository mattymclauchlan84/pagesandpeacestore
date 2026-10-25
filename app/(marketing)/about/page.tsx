import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About Our Independent Bookshop & Café in Rossington",
  description: "Meet Pages & Peace, a sibling-founded independent bookshop and café in Rossington, Doncaster. Discover our books, coffee and community events.",
  alternates: { canonical: "https://pagesandpeace.co.uk/about" },
};

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-[#f8f5f1] text-[#17221f]">
      <section className="mx-auto grid max-w-6xl gap-10 px-6 py-16 lg:grid-cols-2 lg:items-center lg:py-24">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.24em] text-[#477460]">Our story</p>
          <h1 className="mt-5 font-serif text-4xl leading-tight sm:text-5xl">An independent bookshop and café with community at its heart.</h1>
          <p className="mt-6 text-lg leading-8 text-[#40514a]">Pages &amp; Peace is a sibling-founded café and bookshop in Rossington, Doncaster. We created a place to slow down, enjoy a good coffee, find your next read and feel part of something local.</p>
          <div className="mt-8 flex flex-wrap gap-3"><Link href="/visit" className="rounded-full bg-[#17221f] px-6 py-3 text-sm font-semibold text-white hover:bg-[#477460]">Come and visit</Link><Link href="/events" className="rounded-full border border-[#17221f] px-6 py-3 text-sm font-semibold hover:bg-white">Explore our events</Link></div>
        </div>
        <div className="relative min-h-[320px] overflow-hidden rounded-[2rem] sm:min-h-[440px]"><Image src="/home-cafe.jpg" alt="Inside the Pages & Peace café in Rossington" fill sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" /></div>
      </section>
      <section className="mx-auto max-w-6xl px-6 pb-20">
        <div className="grid gap-6 md:grid-cols-3">
          <article className="rounded-[2rem] bg-white p-8"><h2 className="font-serif text-2xl">Books worth discovering</h2><p className="mt-4 leading-7 text-[#40514a]">Explore thoughtfully chosen books, local authors and blind-date books. Whether you know exactly what you want or enjoy a surprise, there is room to browse.</p></article>
          <article className="rounded-[2rem] bg-[#dfebe6] p-8"><h2 className="font-serif text-2xl">Coffee and a little calm</h2><p className="mt-4 leading-7 text-[#40514a]">Drop in for coffee, drinks, light food and sweet treats. You do not need to be attending an event or buying a book to feel welcome.</p><Link href="/menu" className="mt-5 inline-block font-semibold underline underline-offset-4">See the menu</Link></article>
          <article className="rounded-[2rem] bg-[#f1e2d6] p-8"><h2 className="font-serif text-2xl">A place to connect</h2><p className="mt-4 leading-7 text-[#40514a]">Our bookish gatherings, workshops and community evenings bring people together in Rossington. See the live calendar for confirmed events and booking details.</p><Link href="/events" className="mt-5 inline-block font-semibold underline underline-offset-4">What is on</Link></article>
        </div>
        <div className="mt-10 rounded-[2rem] bg-white p-8 sm:p-12"><h2 className="font-serif text-3xl">Find us in Rossington, Doncaster</h2><p className="mt-4 max-w-3xl leading-7 text-[#40514a]">Pages &amp; Peace is at 8 Eva Building, Kings Avenue, Rossington, Doncaster DN11 0PF. Planning a visit? Find current opening hours, contact details and directions on our Visit page.</p><Link href="/visit" className="mt-6 inline-block font-semibold underline underline-offset-4">Plan your visit</Link></div>
      </section>
    </main>
  );
}
