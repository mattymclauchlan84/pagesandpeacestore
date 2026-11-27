import { NextResponse } from "next/server";
import { appCoreDb } from "@/lib/app-core/service";
import { requireAdminUser } from "@/lib/auth/require-admin-user";
import { inStoreUuid, inStoreWriteMode, readInStoreJson } from "@/lib/app-core/in-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const admin = await requireAdminUser();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!inStoreWriteMode()) return NextResponse.json({ error: "In-store refunds are read-only in this environment." }, { status: 403 });
  const data = await readInStoreJson(request);
  if (!data) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const orderId = typeof data.orderId === "string" ? data.orderId : "";
  const refundReference = typeof data.refundReference === "string" ? data.refundReference.trim() : "";
  const refundDate = typeof data.refundDate === "string" ? new Date(data.refundDate) : new Date(NaN);
  const items = data.items;
  const validItems = Array.isArray(items) && items.length > 0 && items.length <= 20 && items.every((item: unknown) => {
    if (!item || typeof item !== "object") return false;
    const value = item as { orderLineId?: unknown; quantity?: unknown };
    return typeof value.orderLineId === "string" && inStoreUuid.test(value.orderLineId) && Number.isInteger(value.quantity) && Number(value.quantity) > 0 && Number(value.quantity) <= 30;
  });
  const confirmed = data.confirmedExternalRefund === true;
  const reason = typeof data.reason === "string" ? data.reason.trim().slice(0, 400) : "";
  if (!inStoreUuid.test(orderId) || !validItems || refundReference.length < 3 || refundReference.length > 128 ||
    !Number.isFinite(refundDate.getTime()) || !confirmed) {
    return NextResponse.json({ error: "Confirm the completed SumUp refund and enter its reference and date." }, { status: 400 });
  }
  const { data: amount, error } = await appCoreDb().rpc("record_in_store_refund", {
    p_order_id: orderId, p_items: items,
    p_sumup_refund_reference: refundReference, p_refund_date: refundDate.toISOString(),
    p_admin_id: admin.id, p_reason: reason,
  });
  if (error || amount == null) {
    const messages: Record<string, string> = {
      ADULT_TICKET_REQUIRED: "At least one adult ticket must remain while children still have tickets.",
      INVALID_QUANTITY: "A refund quantity exceeds the number of tickets still active.",
      INVALID_REFUND: "Check the tickets and quantities in this refund.",
      SUMUP_ORDER_NOT_FOUND: "SumUp order not found.",
      LINE_NOT_FOUND: "The selected ticket is not part of this order.",
      INVALID_REFUND_DATE: "The refund date must be on or after the sale date and cannot be in the future.",
      DUPLICATE_SUMUP_REFUND_REFERENCE: "This SumUp refund reference is already used by a different refund.",
    };
    const message = messages[error?.message ?? ""];
    if (!message) console.error("[in-store-refunds] Record failed", { code: error?.code });
    return NextResponse.json({ error: message ??
      "Unable to verify whether the refund was recorded. Retry with the same details. Do not refund again in SumUp." },
    { status: message ? 409 : 503 });
  }
  return NextResponse.json({ success: true, amountPence: Number(amount) });
}
