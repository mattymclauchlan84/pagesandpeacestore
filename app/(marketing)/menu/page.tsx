import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { supabaseService } from "@/lib/supabase/service";
import Tabs from "./Tabs";

type MenuSectionRow = { id: string; name: string; slug: string; position: number };
type MenuCategory = { id: string; name: string; description: string | null; position: number; section_id: string | null };
type MenuItem = { id: string; category_id: string; name: string; price: number; position: number; note: string | null };

export const metadata: Metadata = {
  title: "Café menu in Rossington, Doncaster",
  description: "See the Pages & Peace café menu in Rossington, Doncaster. Browse coffee, drinks, food and sweet treats, then plan your visit to our independent bookshop café.",
  alternates: { canonical: "https://pagesandpeace.co.uk/menu" },
};

export const dynamic = "force-dynamic";

export default async function MenuPage() {
  const supabase = supabaseService().schema("app_core");

  const [{ data: sections }, { data: categories }, { data: items }] = await Promise.all([
    supabase.from("menu_sections").select("id, name, slug, position").eq("is_visible", true).order("position"),
    supabase.from("menu_categories").select("id, name, description, position, section_id").order("position"),
    supabase.from("menu_items").select("id, category_id, name, price, position, note").eq("is_visible", true).order("position"),
  ]);

  const sectionRows = (sections ?? []) as MenuSectionRow[];
  const categoryRows = (categories ?? []) as MenuCategory[];
  const itemRows = (items ?? []) as MenuItem[];

  const sectionTree = sectionRows
    .map((section) => ({
      ...section,
      categories: categoryRows
        .filter((category) => category.section_id === section.id)
        .map((category) => ({ ...category, items: itemRows.filter((item) => item.category_id === category.id) }))
        .filter((category) => category.items.length > 0),
    }))
    .filter((section) => section.categories.length > 0);

  return (
    <main className="min-h-screen bg-[#FAF6F1] px-6 py-12 font-[Montserrat] text-[#111]">
      <section className="mb-10 flex flex-col items-center text-center">
        <Image src="/p&p_logo_cream.svg" alt="Pages & Peace logo" width={140} height={140} className="mb-4" />
        <h1 className="text-4xl font-semibold tracking-widest text-[#5DA865] sm:text-5xl">Our Menu</h1>
        <p className="mt-2 text-[#111]/70">Coffee, food and sweet treats at our independent bookshop café in Rossington, Doncaster.</p>
      </section>

      <Tabs sections={sectionTree} />

      <section className="mx-auto mt-12 max-w-3xl rounded-2xl bg-white p-7 text-center shadow-sm sm:p-10" aria-labelledby="visit-menu-heading">
        <h2 id="visit-menu-heading" className="text-2xl font-semibold text-[#17221f]">Fancy a coffee and a browse?</h2>
        <p className="mx-auto mt-3 max-w-xl leading-7 text-[#40514a]">Pages &amp; Peace is more than a café menu. Visit our independent bookshop and café in Rossington, Doncaster for a drink, something to eat and time among the books.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/visit" className="rounded-full bg-[#17221f] px-6 py-3 text-sm font-semibold text-white hover:bg-[#477460]">Plan your visit</Link>
          <a href="https://www.google.com/maps/search/?api=1&query=8+Eva+Building+Kings+Avenue+Rossington+Doncaster+DN11+0PF" target="_blank" rel="noreferrer" className="rounded-full border border-[#17221f] px-6 py-3 text-sm font-semibold text-[#17221f] hover:bg-[#f8f5f1]">Get directions</a>
        </div>
      </section>

      <div className="mt-16 text-center">
        <Link href="/" className="inline-block font-medium text-[#5DA865] hover:underline">← Back to Home</Link>
      </div>
    </main>
  );
}
