import { NextResponse } from "next/server";

import { isMissingEventBookingRuleColumn } from "@/lib/app-core/event-booking-rule";
import { appCoreDb } from "@/lib/app-core/service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { ticketTypeIds?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 }); }
  const ids = Array.isArray(body.ticketTypeIds) ? body.ticketTypeIds.filter((id): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id)).slice(0, 20) : [];
  if (!ids.length) return NextResponse.json({ items: [] });

  const db = appCoreDb();
  const loadItems = (withBookingRule: boolean) => {
    const table = db.from("ticket_types");
    const query = withBookingRule
      ? table.select("id, name, price_pence, is_active, events!inner(title, slug, status, starts_at, booking_rule)")
      : table.select("id, name, price_pence, is_active, events!inner(title, slug, status, starts_at)");

    return query.in("id", ids)
      .eq("is_active", true)
      .eq("events.status", "published")
      .gt("events.starts_at", new Date().toISOString());
  };

  const result = await loadItems(true);
  const { data, error } = isMissingEventBookingRuleColumn(result.error) ? await loadItems(false) : result;
  if (error) return NextResponse.json({ error: "BASKET_UNAVAILABLE" }, { status: 503 });
  return NextResponse.json({ items: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}
