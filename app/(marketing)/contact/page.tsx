"use client";

import { useState } from "react";
import Link from "next/link";

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] font-[Montserrat] py-16 px-6">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-4xl font-bold mb-6 tracking-wide">
          Contact Pages &amp; Peace in Rossington
        </h1>

        <p className="text-[var(--foreground)]/80 mb-10">
          Visit our independent bookshop and café in Rossington, Doncaster, or get in touch about books, café visits and community events. Find our details, directions and message form below.
        </p>

        <div className="bg-white rounded-xl border border-[#e5e2dc] p-6 mb-12 shadow-sm">
          <h2 className="text-xl font-semibold mb-4 tracking-wide">
            Pages & Peace Coffee + Bookshop
          </h2>

          <ul className="space-y-3 text-[var(--foreground)]/80">
            <li>
              <strong>Email:</strong>{" "}
              <a
                href="mailto:admin@pagesandpeace.co.uk"
                className="text-[var(--accent)] font-medium hover:underline"
              >
                admin@pagesandpeace.co.uk
              </a>
            </li>

            <li>
              <strong>Phone:</strong>{" "}
              <a
                href="tel:07395266100"
                className="text-[var(--accent)] font-medium hover:underline"
              >
                07395266100
              </a>
            </li>

            <li>
              <strong>Address:</strong><br />
              8 Eva Building<br />
              Kings Avenue<br />
              Rossington, Doncaster<br />
              DN11 0PF
            </li>
          </ul>
        </div>

        <div className="mb-10 grid gap-5 sm:grid-cols-2"><section className="rounded-xl bg-[#dfebe6] p-6"><h2 className="text-xl font-semibold">Find our café &amp; bookshop</h2><p className="mt-3 leading-7">Planning a visit? See our menu and find your way to Kings Avenue, Rossington.</p><div className="mt-5 flex flex-wrap gap-4"><Link href="/visit" className="font-semibold underline underline-offset-4">Plan your visit</Link><a href="https://www.google.com/maps/search/?api=1&query=8+Eva+Building+Kings+Avenue+Rossington+Doncaster+DN11+0PF" target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-4">Get directions</a></div></section><section className="rounded-xl bg-[#f1e2d6] p-6"><h2 className="text-xl font-semibold">Opening hours</h2><p className="mt-3 leading-7">See the latest café opening hours on our Visit page before setting off.</p><Link href="/visit" className="mt-5 inline-block font-semibold underline underline-offset-4">View opening hours</Link></section></div>

        <div className="bg-white rounded-xl border border-[#e5e2dc] p-6 shadow-sm">
          <h2 className="text-xl font-semibold mb-4 tracking-wide">
            Send Us a Message
          </h2>

          {submitted ? (
            <div className="bg-[#E5F7E4] border border-[#5DA865]/30 text-[#2f6b3a] rounded-lg p-4 mt-4">
              Thank you! Your message has been sent.
            </div>
          ) : (
            <form
              className="space-y-5"
              onSubmit={async (e) => {
                e.preventDefault();
                if (loading) return;

                setLoading(true);

                const formData = new FormData(e.currentTarget);

                const res = await fetch("/api/contact", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    name: formData.get("name"),
                    email: formData.get("email"),
                    message: formData.get("message"),
                  }),
                });

                if (res.ok) setSubmitted(true);
                setLoading(false);
              }}
            >
              <div>
                <label className="block text-sm font-medium">
                  Your Name
                </label>
                <input
                  name="name"
                  type="text"
                  required
                  className="mt-1 w-full rounded-md border border-[#ccc] px-3 py-2 focus:ring-2 focus:ring-[var(--accent)]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium">
                  Your Email
                </label>
                <input
                  name="email"
                  type="email"
                  required
                  className="mt-1 w-full rounded-md border border-[#ccc] px-3 py-2 focus:ring-2 focus:ring-[var(--accent)]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium">
                  Message
                </label>
                <textarea
                  name="message"
                  rows={4}
                  required
                  className="mt-1 w-full rounded-md border border-[#ccc] px-3 py-2 focus:ring-2 focus:ring-[var(--accent)]"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-full px-6 py-3 bg-[var(--accent)] text-black font-semibold text-sm hover:bg-[var(--secondary)] transition disabled:opacity-50"
              >
                {loading ? "Sending…" : "Send Message"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
