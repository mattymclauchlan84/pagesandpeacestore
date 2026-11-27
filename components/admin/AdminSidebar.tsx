"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { User } from "@supabase/supabase-js";

export type UserProfile = { id: string; auth_user_id: string; email: string | null; name: string | null; image: string | null; role: "admin" | "customer"; };

export default function AdminSidebar({ user, profile }: { user: User; profile: UserProfile }) {
  const router = useRouter();
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  async function signOut() { await fetch("/auth/signout", { method: "POST" }); window.dispatchEvent(new Event("pp:auth-updated")); router.push("/sign-in"); }
  const nav = [
    { label: "Dashboard", href: "/admin" },
    { label: "Events", href: "/admin/events" },
    { label: "Event bookings", href: "/admin/events/bookings" },
    { label: "Users", href: "/admin/users" },
    { label: "Book community", href: "/admin/community" },
    { label: "Menu", href: "/admin/menu" },
    { label: "Opening hours", href: "/admin/store-settings" },
  ];

  return <aside className="border-b border-[#dcd6cf] bg-[#FAF6F1] lg:fixed lg:inset-y-0 lg:left-0 lg:z-50 lg:flex lg:w-64 lg:flex-col lg:justify-between lg:overflow-y-auto lg:border-b-0 lg:border-r">
    <div className="px-4 pt-3 lg:px-6 lg:pt-10">
      <div className="flex items-center justify-between gap-3">
        <button onClick={() => { setNavigationOpen(false); router.push("/admin"); }} className="flex items-center justify-center" aria-label="Admin dashboard">
          <Image src="/p&p_logo_cream.svg" alt="Pages & Peace Logo" width={100} height={100} className="h-12 w-12 lg:h-[100px] lg:w-[100px]" />
        </button>
        <button type="button" aria-expanded={navigationOpen} aria-controls="admin-navigation" onClick={() => setNavigationOpen(!navigationOpen)} className="rounded-lg border px-3 py-2 text-sm font-medium lg:hidden">
          Admin menu
        </button>
      </div>
      <nav id="admin-navigation" aria-label="Admin navigation" className={`${navigationOpen ? "flex" : "hidden"} flex-col gap-1 py-3 text-sm lg:mt-8 lg:flex lg:gap-3 lg:py-0`}>
        {nav.map((item) => <button key={item.href} onClick={() => { setNavigationOpen(false); router.push(item.href); }} className="py-2 text-left font-medium hover:text-[#5DA865] lg:py-0">{item.label}</button>)}
      </nav>
    </div>
    <div className={`${navigationOpen ? "block" : "hidden"} relative border-t border-[#ded7cf] px-4 py-2 lg:block lg:px-6 lg:py-6`}>
      <button onClick={() => setMenuOpen((open) => !open)} className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-[#f1ede7]"><Image src={profile.image ?? "/user_avatar_placeholder.svg"} alt="" width={36} height={36} className="rounded-full border object-cover" /><div className="min-w-0"><p className="truncate text-sm font-medium">{profile.name || user.email || "Admin"}</p><span className="mt-1 inline-block rounded-full border border-red-300 bg-red-200 px-2 py-0.5 text-xs text-red-700">Admin</span></div></button>
      {menuOpen ? <div className="absolute bottom-[106px] left-6 w-44 rounded-md border bg-white shadow"><button onClick={() => router.push("/admin/account")} className="block w-full px-4 py-2 text-left text-sm hover:bg-[#FAF6F1]">My account</button><button onClick={signOut} className="block w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-[#FAF6F1]">Sign out</button></div> : null}
    </div>
  </aside>;
}
