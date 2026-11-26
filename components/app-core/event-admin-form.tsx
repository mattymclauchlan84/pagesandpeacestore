"use client";

import Link from "next/link";
import { startTransition, useActionState, type ReactNode } from "react";

export function EventAdminForm({
  action, children, submitLabel,
}: {
  action: (previous: string | null, data: FormData) => Promise<string | null>;
  children: ReactNode;
  submitLabel: string;
}) {
  const [error, submit, isPending] = useActionState(action, null);

  return (
    <form
      action={submit}
      onSubmit={(event) => {
        event.preventDefault();
        if (isPending) return;
        const data = new FormData(event.currentTarget);
        startTransition(() => submit(data));
      }}
      className="mt-8 space-y-6 rounded-2xl border border-black/10 bg-white p-6 shadow-sm"
    >
      {children}
      {error ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
      <div className="flex items-center gap-4 border-t pt-5">
        <button type="submit" disabled={isPending} className="rounded-lg bg-black px-5 py-3 font-semibold text-white disabled:opacity-60">
          {isPending ? "Saving…" : submitLabel}
        </button>
        <Link href="/admin/events" className="py-3 text-sm underline">Cancel</Link>
      </div>
    </form>
  );
}
