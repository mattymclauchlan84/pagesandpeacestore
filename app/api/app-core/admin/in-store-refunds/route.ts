import { NextResponse } from "next/server";
import { appCoreDb } from "@/lib/app-core/service";
import { requireAdminUser } from "@/lib/auth/require-admin-user";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function POST(request: Request) {
  const admin = await requireAdminUser();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const localUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const isolatedTest = process.env.ALLOW_LOCAL_IN_STORE_TESTS === "true" && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/i.test(localUrl);
  if (process.env.VERCEL_ENV !== "production" && !isolatedTest) return NextResponse.json({ error: "Non-production mode is read-only. Use an isolated local database for tests." }, { status: 403 });
  let data: Record<string, unknown>;
  try { data = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const orderId = typeof data.orderId === "string" ? data.orderId : "";
  const refundReference = typeof data.refundReference === "string" ? data.refundReference.trim() : "";
  const refundDate = typeof data.refundDate === "string" ? new Date(data.refundDate) : new Date(NaN);
  const items = data.items;
  const validItems = Array.isArray(items) && items.length > 0 && items.length <= 20 && items.every((item: unknown) => {
    if (!item || typeof item !== "object") return false;
    const value = item as { orderLineId?: unknown; quantity?: unknown };
    return typeof value.orderLineId === "string" && uuid.test(value.orderLineId) && Number.isInteger(value.quantity) && Number(value.quantity) > 0 && Number(value.quantity) <= 30;
  });
  const confirmed = data.confirmedExternalRefund === true;
  const reason = typeof data.reason === "string" ? data.reason.trim().slice(0, 400) : "";
  if (!uuid.test(orderId) || !validItems || refundReference.length < 3 || refundReference.length > 128 ||
    !Number.isFinite(refundDate.getTime()) || !confirmed) {
    return NextResponse.json({ error: "Confirm the completed SumUp refund and enter its reference and date." }, { status: 400 });
  }
  const { data: amount, error } = await appCoreDb().rpc("record_in_store_refund", {
    p_order_id: orderId, p_items: items,
    p_sumup_refund_reference: refundReference, p_refund_date: refundDate.toISOString(),
    p_admin_id: admin.id, p_reason: reason,
  });
  if (error || amount == null) {
    const known = ["ADULT_TICKET_REQUIRED", "INVALID_QUANTITY", "INVALID_REFUND", "SUMUP_ORDER_NOT_FOUND", "LINE_NOT_FOUND", "INVALID_REFUND_DATE", "DUPLICATE_SUMUP_REFERENCE"];
    console.error("[in-store-refunds] Record failed", { code: error?.code });
    return NextResponse.json({ error: known.includes(error?.message ?? "") ? error?.message : "Unable to record SumUp refund. Check the reference and ticket quantity." }, { status: 409 });
  }
  return NextResponse.json({ success: true, amountPence: Number(amount) });
}
