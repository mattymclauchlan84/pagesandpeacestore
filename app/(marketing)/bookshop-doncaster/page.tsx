import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Independent Bookshop in Doncaster | Pages & Peace",
  description: "Looking for an independent bookshop in Doncaster? Discover Pages & Peace in Rossington: books to browse, coffee, reading events and a welcoming space. Plan your visit.",
  alternates: { canonical: "https://pagesandpeace.co.uk/bookshop-doncaster" },
  openGraph: {
    title: "An Independent Bookshop Near Doncaster | Pages & Peace",
    description: "Browse books, enjoy coffee and discover reading events at Pages & Peace in Rossington, Doncaster.",
    url: "https://pagesandpeace.co.uk/bookshop-doncaster",
    type: "website",
    images: [{ url: "https://res.cloudinary.com/dadinnds6/image/upload/v1792940808/shelves_xy3msz.jpg", alt: "Pages & Peace bookshop café in Rossington" }],
  },
};

const bookshopSchema = {
  "@context": "https://schema.org",
  "@type": "BookStore",
  name: "Pages & Peace",
  url: "https://pagesandpeace.co.uk/bookshop-doncaster",
  image: "https://res.cloudinary.com/dadinnds6/image/upload/v1792940808/shelves_xy3msz.jpg",
  description: "Independent bookshop and café with community events in Rossington, Doncaster.",
  address: {
    "@type": "PostalAddress",
    streetAddress: "8 Eva Building, Kings Avenue",
    addressLocality: "Rossington",
    addressRegion: "Doncaster",
    postalCode: "DN11 0PF",
    addressCountry: "GB",
  },
};

const directions = "https://www.google.com/maps/search/?api=1&query=8+Eva+Building+Kings+Avenue+Rossington+Doncaster+DN11+0PF";

export default function BookshopDoncasterPage() {
  return (
    <main className="overflow-hidden bg-[#f8f5f1] text-[#17221f]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(bookshopSchema) }} />
      <section className="mx-auto grid max-w-[1440px] lg:grid-cols-[1fr_1fr]">
        <div className="flex flex-col justify-center px-6 py-16 sm:px-10 lg:px-16 lg:py-24">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#477460]">Pages &amp; Peace · Rossington, Doncaster</p>
          <h1 className="mt-6 max-w-2xl text-balance font-serif text-5xl leading-[1.04] tracking-tight sm:text-6xl">Your independent bookshop in Doncaster.</h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-[#40514a]">Some books are better discovered by browsing. At Pages &amp; Peace in Rossington, you can explore the shelves, find something unexpected and settle in with a coffee.</p>
          <p className="mt-4 max-w-xl leading-7 text-[#40514a]">We're an independent bookshop and café, with bookish events and a welcoming space for readers from Rossington and across Doncaster.</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/visit" className="rounded-full bg-[#17221f] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#477460]">Plan your visit</Link>
            <a href={directions} target="_blank" rel="noopener noreferrer" className="rounded-full border border-[#17221f] px-6 py-3 text-sm font-semibold transition hover:bg-white">Get directions</a>
          </div>
        </div>
        <div className="relative min-h-[360px] lg:min-h-[620px]">
          <Image src="https://res.cloudinary.com/dadinnds6/image/upload/v1792940808/shelves_xy3msz.jpg" alt="Pages & Peace independent bookshop and café in Rossington, Doncaster" fill priority sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16 sm:py-24">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#477460]">A bookshop worth spending time in</p>
        <h2 className="mt-4 max-w-3xl font-serif text-4xl sm:text-5xl">Come in for a book. Stay for the feeling.</h2>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          <article className="rounded-[1.75rem] bg-white p-8"><h3 className="font-serif text-2xl">Browse at your own pace</h3><p className="mt-4 leading-7 text-[#40514a]">There's something special about picking up a book, reading the back cover and finding the one you didn't know you wanted. Take your time among our shelves.</p></article>
          <article className="rounded-[1.75rem] bg-[#dfebe6] p-8"><h3 className="font-serif text-2xl">Books and a good coffee</h3><p className="mt-4 leading-7 text-[#40514a]">Our bookshop and café belong together. Make an afternoon of it with a drink, a sweet treat or a light bite after browsing.</p><Link href="/menu" className="mt-5 inline-block font-semibold underline underline-offset-4">Explore the café menu</Link></article>
          <article className="rounded-[1.75rem] bg-[#f1e2d6] p-8"><h3 className="font-serif text-2xl">Meet fellow readers</h3><p className="mt-4 leading-7 text-[#40514a]">Books can bring people together. Discover book clubs, creative gatherings and other community events through our live programme.</p><Link href="/events" className="mt-5 inline-block font-semibold underline underline-offset-4">See upcoming events</Link></article>
        </div>
      </section>

      <section className="bg-[#e7eee8] px-6 py-16 sm:py-24">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1fr_1fr] lg:items-center">
          <div className="relative min-h-[300px] overflow-hidden rounded-[2rem] sm:min-h-[420px]"><Image src="https://res.cloudinary.com/dadinnds6/image/upload/v1792940809/6782c007-5932-4eca-9bf5-ce1d92ebff89_ilxcrb.jpg" alt="The welcoming café space at Pages & Peace" fill sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" /></div>
          <div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#477460]">More than a bookshop</p><h2 className="mt-4 font-serif text-4xl">A little breathing room between chapters.</h2><p className="mt-6 leading-8 text-[#40514a]">Looking for a bookshop near Doncaster where you can actually linger? Pages &amp; Peace brings together books, coffee and a relaxed community atmosphere in Rossington. Come alone, bring a friend or join us for an event.</p><Link href="/about" className="mt-6 inline-block font-semibold underline underline-offset-4">Read our story</Link></div>
        </div>
      </section>


      <section className="mx-auto max-w-6xl px-6 py-16 sm:py-24" aria-labelledby="gallery-heading">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#477460]">A look inside</p>
        <h2 id="gallery-heading" className="mt-4 max-w-3xl font-serif text-4xl sm:text-5xl">Explore our Rossington bookshop and café.</h2>
        <p className="mt-5 max-w-2xl leading-8 text-[#40514a]">Take a look around Pages &amp; Peace before your visit. Browse our books, enjoy a coffee and discover a welcoming independent space just outside Doncaster.</p>
        <div className="mt-10 grid grid-cols-2 gap-4 md:gap-6">
          <figure className="relative aspect-[4/5] overflow-hidden rounded-[1.5rem] bg-[#e7eee8]"><Image src="https://res.cloudinary.com/dadinnds6/image/upload/v1792940808/4808c068-4186-4ad0-b83e-f8630b6b9e48_pw4snt.jpg" alt="Inside Pages & Peace bookshop in Rossington" fill sizes="(min-width: 1024px) 540px, 50vw" className="object-cover" /></figure>
          <figure className="relative aspect-[4/5] overflow-hidden rounded-[1.5rem] bg-[#e7eee8]"><Image src="https://res.cloudinary.com/dadinnds6/image/upload/v1792940808/47a034fd-f3cd-4d18-9f89-08fcff8b6d2e_cxjnal.jpg" alt="The welcoming Pages & Peace bookshop and café" fill sizes="(min-width: 1024px) 540px, 50vw" className="object-cover" /></figure>
          <figure className="relative aspect-[4/5] overflow-hidden rounded-[1.5rem] bg-[#e7eee8]"><Image src="https://res.cloudinary.com/dadinnds6/image/upload/v1792940808/7d234d50-eb9b-4eeb-96f4-66e2ce776731_dypoic.jpg" alt="A closer look at Pages & Peace in Doncaster" fill sizes="(min-width: 1024px) 540px, 50vw" className="object-cover" /></figure>
          <figure className="relative aspect-[4/5] overflow-hidden rounded-[1.5rem] bg-[#e7eee8]"><Image src="https://res.cloudinary.com/dadinnds6/image/upload/v1792940808/7a810575-b411-45c4-b2ec-17fdb51e90b8_ll5gom.jpg" alt="Discover Pages & Peace independent bookshop" fill sizes="(min-width: 1024px) 540px, 50vw" className="object-cover" /></figure>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16 sm:py-24">
        <div className="rounded-[2rem] bg-white p-8 sm:p-12">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#477460]">Visit Pages &amp; Peace</p>
          <h2 className="mt-4 font-serif text-4xl">Find our bookshop in Rossington.</h2>
          <p className="mt-5 max-w-3xl leading-8 text-[#40514a]">We're at 8 Eva Building, Kings Avenue, Rossington, Doncaster DN11 0PF. Whether you're nearby or coming from elsewhere in Doncaster, check our latest opening hours before travelling and drop in for a browse.</p>
          <div className="mt-8 flex flex-wrap gap-3"><Link href="/visit" className="rounded-full bg-[#17221f] px-6 py-3 text-sm font-semibold text-white hover:bg-[#477460]">Address &amp; opening hours</Link><a href={directions} target="_blank" rel="noopener noreferrer" className="rounded-full border border-[#17221f] px-6 py-3 text-sm font-semibold hover:bg-[#f8f5f1]">Directions on Google Maps</a></div>
        </div>
      </section>
    </main>
  );
}
