"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { InStoreConfirmationStatus } from "@/lib/app-core/in-store-confirmation";

const labels: Record<InStoreConfirmationStatus, string> = {
  sent: "Confirmation accepted by email provider",
  failed: "Confirmation attempt failed",
  pending: "Confirmation status pending",
  review: "Confirmation requires review in Resend before any manual follow-up",
};

export default function InStoreConfirmation({ orderId, status, canRecord }: {
  orderId: string; status: InStoreConfirmationStatus; canRecord: boolean;
}) {
  const router = useRouter();
  const [result, setResult] = useState<InStoreConfirmationStatus>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const currentStatus = status === "sent" ? status : result ?? status;

  async function retry() {
    setBusy(true);
    setError(false);
    try {
      const response = await fetch("/api/app-core/admin/in-store-sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retryConfirmationOrderId: orderId }),
      });
      if (!response.ok) throw new Error("Retry unavailable");
      setResult((await response.json()).confirmation);
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
    <p role="status">{labels[currentStatus]}</p>
    {canRecord && (currentStatus === "pending" || currentStatus === "failed") ? (
      <button type="button" onClick={retry} disabled={busy} className="rounded border px-2 py-1">
        {busy ? "Checking…" : "Retry confirmation"}
      </button>
    ) : null}
    {error ? <p role="alert">Confirmation could not be checked. Try again from this order.</p> : null}
  </div>;
}
