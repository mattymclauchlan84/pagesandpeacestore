import Link from "next/link";
import { redirect } from "next/navigation";

import EventOrdersTable from "@/components/admin/event-orders-table";
import Pagination from "@/components/admin/Pagination";
import { getAdminEventOrders } from "@/lib/app-core/event-orders";
import { inStoreWriteMode, isMissingInStoreTable } from "@/lib/app-core/in-store";
import type { InStoreConfirmationStatus } from "@/lib/app-core/in-store-confirmation";
import { appCoreDb } from "@/lib/app-core/service";
import { requireAdminUser } from "@/lib/auth/require-admin-user";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

export default async function AdminEventBookingsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const admin = await requireAdminUser();
  if (!admin) redirect("/sign-in");

  const requestedPage = Number((await searchParams).page ?? "1");
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? Math.floor(requestedPage) : 1;

  const { orders, customers } = await getAdminEventOrders();
  const totalPages = Math.max(1, Math.ceil(orders.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedOrders = orders.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const { data: inStoreSales, error: sumupError } = pagedOrders.length
    ? await appCoreDb().from("in_store_sales")
      .select("order_id, sumup_reference, sale_date, customer_name, customer_email, confirmation_status, confirmation_started_at")
      .in("order_id", pagedOrders.map((order) => order.id))
    : { data: [], error: null };
  // The migration must be deployed before this feature can record a sale.
  // An unavailable table during preview must not break the Stripe register.
  if (sumupError && !isMissingInStoreTable(sumupError.code)) {
    throw new Error("Could not load in-store sales");
  }
  const sumupByOrder = new Map((inStoreSales ?? []).map((sale) => [sale.order_id, sale]));

  const confirmationCutoff = new Date().getTime() - 23 * 60 * 60 * 1000;
  const groupedOrders = pagedOrders.map((order) => {
    const customer = order.auth_user_id ? customers.get(order.auth_user_id) : undefined;
    const inStoreSale = sumupByOrder.get(order.id);
    const needsReview = inStoreSale?.confirmation_status !== "sent" &&
      (order.refund_status === "partial" || order.refund_status === "full" ||
        (inStoreSale?.confirmation_started_at && Date.parse(inStoreSale.confirmation_started_at) <= confirmationCutoff));
    return {
      id: order.id,
      created_at: order.created_at,
      total_pence: Number(order.total_pence),
      refunded_total_pence: Number(order.refunded_total_pence ?? 0),
      refund_status: order.refund_status ?? "none",
      customerName: inStoreSale?.customer_name ?? customer?.display_name ?? "Customer",
      customerEmail: inStoreSale?.customer_email ?? customer?.email ?? "",
      sumup: inStoreSale ? {
        reference: inStoreSale.sumup_reference,
        saleDate: inStoreSale.sale_date,
        confirmation: (needsReview ? "review" : inStoreSale.confirmation_status) as InStoreConfirmationStatus,
      } : null,
      lines: order.lines.map((line) => ({
        id: line.id,
        item_name: line.item_name,
        quantity: Number(line.quantity),
        unit_amount_pence: Number(line.unit_amount_pence),
        refunded_quantity: Number(line.refunded_quantity ?? 0),
        refunded_amount_pence: Number(line.refunded_amount_pence ?? 0),
        eventTitle: line.event?.title ?? line.item_name,
        eventStartsAt: line.event?.starts_at ?? null,
        ticketName: line.ticket?.name ?? "Ticket",
      })),
    };
  });

  return (
    <main className="min-h-screen bg-[#FAF6F1] px-6 py-12 text-[#111]">
      <div className="mx-auto max-w-7xl">
        <Link href="/admin" className="text-sm underline">← Admin dashboard</Link>
        <h1 className="mt-4 text-3xl font-semibold">Event orders & refunds</h1>
        <p className="mt-1 max-w-3xl text-sm text-neutral-600">
          Each row is one customer purchase. Open an order to see the events inside it, refund one event, or refund the remaining order in full.
        </p>

        <div className="mt-8 overflow-hidden rounded-2xl border bg-white">
          <EventOrdersTable orders={groupedOrders} canRecord={Boolean(inStoreWriteMode())} />
          <Pagination page={safePage} totalPages={totalPages} basePath="/admin/events/bookings" />
        </div>

        {!orders.length ? <p className="mt-6 text-sm text-neutral-600">No paid event orders yet.</p> : null}
      </div>
    </main>
  );
}
