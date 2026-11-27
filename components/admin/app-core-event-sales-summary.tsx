import Link from "next/link";

import EventRevenueComparison from "@/components/admin/event-revenue-comparison";
import EventTypeRevenue from "@/components/admin/event-type-revenue";
import { formatLondonDateTime } from "@/lib/time/london";
import { eventRevenueComparison, eventRevenueMonthKey, eventTradingYearStartMonth } from "@/lib/app-core/event-revenue-trend";

import { getAdminEventOrders } from "@/lib/app-core/event-orders";
import { requireAdminUser } from "@/lib/auth/require-admin-user";

const money = (pence: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);

function canonicalEventName(seriesName: string | null | undefined, title: string | null | undefined, fallback: string) {
  if (seriesName?.trim()) return seriesName.trim();
  const normalized = (title || fallback).toLowerCase();

  if (normalized.includes("silent reading")) return "Silent Read";
  if (normalized.includes("medium")) return "Mediumship";
  if (normalized.includes("d&d") || normalized.includes("d & d")) return "D&D";
  if (normalized.includes("bingo")) return "Bingo";
  if (normalized.includes("bookish creative")) return "Bookish Creative Club";
  if (normalized.includes("book of the month")) return "Book of the Month Book Club";
  if (normalized.includes("monthly chapter")) return "Monthly Chapter Book Club";
  if (normalized.includes("book chatter")) return "Book Chatter Club";
  if (normalized.includes("dark romance book club")) return "Dark Romance Book Club";
  if (normalized.includes("quiz night")) return "Quiz Night";
  if (normalized.includes("pamper night")) return "Pamper Night";
  if (normalized.includes("paint & sip")) return "Paint & Sip";
  if (normalized.includes("secret hungry hippo")) return "Secret Hungry Hippo";

  return title || fallback;
}

export default async function AppCoreEventSalesSummary() {
  const admin = await requireAdminUser();
  if (!admin) return null;

  const { orders } = await getAdminEventOrders();
  const lines = orders.flatMap((order) => order.lines.map((line) => ({
    orderId: order.id,
    name: canonicalEventName(line.event?.series_name, line.event?.title, line.item_name),
    isSumUp: Boolean(order.sumupSaleDate),
    saleMonth: order.sumupSaleDate?.slice(0, 7) ?? eventRevenueMonthKey(new Date(order.created_at)),
    quantity: Number(line.quantity),
    refundedQuantity: Number(line.refunded_quantity ?? 0),
    grossPence: Number(line.quantity) * Number(line.unit_amount_pence),
    refundedPence: Number(line.refunded_amount_pence ?? 0),
  })));

  const netQuantity = (line: (typeof lines)[number]) => Math.max(0, line.quantity - line.refundedQuantity);
  const netRevenue = (line: (typeof lines)[number]) => Math.max(0, line.grossPence - line.refundedPence);

  const now = new Date();
  const currentMonth = eventRevenueMonthKey(now);
  const startMonth = eventTradingYearStartMonth(currentMonth);
  const tradingYearLines = lines.filter((line) => line.saleMonth >= startMonth && line.saleMonth <= currentMonth);
  const dateOptions = { day: "numeric", month: "short", year: "numeric" } as const;
  const tradingYearStart = formatLondonDateTime(`${startMonth}-01T12:00:00Z`, dateOptions);
  const today = formatLondonDateTime(now, dateOptions);

  const revenue = tradingYearLines.reduce((total, line) => total + netRevenue(line), 0);
  const sumupRevenue = tradingYearLines.filter((line) => line.isSumUp).reduce((total, line) => total + netRevenue(line), 0);
  const refunded = tradingYearLines.reduce((total, line) => total + line.refundedPence, 0);
  const tickets = tradingYearLines.reduce((total, line) => total + netQuantity(line), 0);

  const orderNet = new Map<string, number>();
  for (const line of tradingYearLines) orderNet.set(line.orderId, (orderNet.get(line.orderId) ?? 0) + netRevenue(line));
  const activeOrders = [...orderNet.values()].filter((amount) => amount > 0).length;

  const totalsByMonth = new Map<string, number>();
  for (const line of lines) {
    totalsByMonth.set(line.saleMonth, (totalsByMonth.get(line.saleMonth) ?? 0) + netRevenue(line));
  }
  const thisMonthRevenue = totalsByMonth.get(currentMonth) ?? 0;
  const trend = eventRevenueComparison(now, totalsByMonth);

  const byEvent = new Map<string, { name: string; revenue: number; tickets: number }>();
  for (const line of tradingYearLines) {
    const current = byEvent.get(line.name) ?? { name: line.name, revenue: 0, tickets: 0 };
    current.revenue += netRevenue(line);
    current.tickets += netQuantity(line);
    byEvent.set(line.name, current);
  }
  const events = [...byEvent.values()].filter((event) => event.revenue > 0 || event.tickets > 0).sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name));

  return <div className="space-y-8">
    <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><h2 className="text-2xl font-bold">Event sales year to date</h2><p className="mt-1 text-sm text-emerald-900/70">{tradingYearStart} to {today} · Net of refunds.</p></div>
        <Link href="/admin/events/bookings" className="rounded-lg bg-emerald-800 px-4 py-2 text-sm font-semibold text-white">View booking register & refunds</Link>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-6">
        <Metric label="Net event revenue" value={money(revenue)} />
        <Metric label="Net in-store (SumUp)" value={money(sumupRevenue)} />
        <Metric label="Active paid orders" value={activeOrders.toLocaleString("en-GB")} />
        <Metric label="Net tickets sold" value={tickets.toLocaleString("en-GB")} />
        <Metric label="Revenue this month" value={money(thisMonthRevenue)} />
        <Metric label="Refunded total" value={money(refunded)} />
      </div>
    </section>

    <EventRevenueComparison months={trend} />

    <EventTypeRevenue events={events} totalRevenue={revenue} />
  </div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-white p-3 sm:p-4"><p className="text-xs uppercase tracking-wide text-foreground/60">{label}</p><p className="mt-1 text-xl font-bold sm:text-2xl">{value}</p></div>;
}
