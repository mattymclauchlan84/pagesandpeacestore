import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact Our Café & Bookshop in Rossington, Doncaster",
  description: "Contact Pages & Peace in Rossington, Doncaster. Find our café and bookshop address, opening hours, directions, phone number and message form.",
  alternates: { canonical: "https://pagesandpeace.co.uk/contact" },
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return children;
}
