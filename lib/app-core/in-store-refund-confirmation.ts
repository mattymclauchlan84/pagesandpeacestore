import "server-only";

import { appCoreDb } from "@/lib/app-core/service";
import { FROM, getResendClient } from "@/lib/email/client";

const recoveryWindowMs = 23 * 60 * 60 * 1000;

export async function sendInStoreRefundConfirmation(orderId: string, reference: string, testRefund = false, previewAdminId?: string) {
  try {
    const db = appCoreDb();
    const [sale, refunds, lines] = await Promise.all([
      db.from("in_store_sales").select("customer_email, customer_name").eq("order_id", orderId).single(),
      db.from("in_store_refunds").select("id, items, sumup_refund_reference, quantity, amount_pence, created_at, created_by_auth_user_id").eq("order_id", orderId),
      db.from("order_lines").select("id, item_name").eq("order_id", orderId),
    ]);
    if (sale.error || refunds.error || lines.error) throw new Error("Refund confirmation data unavailable");

    const refund = refunds.data.find((entry) => entry.sumup_refund_reference.toLowerCase() === reference.toLowerCase());
    if (!refund || (previewAdminId && refund.created_by_auth_user_id !== previewAdminId)) throw new Error("Refund record unavailable");

    // An identical refund replay reuses the same message key. Do not resend
    // after the provider could have expired that key.
    if (Date.now() - Date.parse(refund.created_at) >= recoveryWindowMs) return "review" as const;

    const names = new Map(lines.data.map((line) => [line.id, line.item_name]));
    const items = (refund.items as Array<{ orderLineId: string; quantity: number }>).map((item) =>
      `${names.get(item.orderLineId) || "Event ticket"} × ${item.quantity}`);
    const { data, error } = await getResendClient().emails.send({
      from: FROM,
      to: sale.data.customer_email,
      template: {
        id: "refund-confirmation",
        variables: {
          CUSTOMER_NAME: sale.data.customer_name || "there",
          REFUND_ITEM: items.join(", "),
          REFUND_AMOUNT: (refund.amount_pence / 100).toFixed(2),
          ORDER_REFERENCE: orderId.slice(0, 8),
          REFUND_TYPE: testRefund ? "SumUp test refund (no payment taken)" : `${refund.quantity}-ticket SumUp refund`,
        },
      },
    }, { idempotencyKey: `in-store-refund-confirmation/${refund.id}` });
    if (error || !data?.id) throw new Error("Provider did not accept refund confirmation");
    return "sent" as const;
  } catch {
    console.error("[in-store-refunds] Refund was recorded but confirmation could not be verified");
    return "failed" as const;
  }
}
