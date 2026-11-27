import "server-only";

function localEndpoint(value: string | undefined) {
  return Boolean(value && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/i.test(value));
}

export function inStoreWriteMode() {
  if (process.env.DISABLE_IN_STORE_WRITES === "true") return null;
  if (process.env.VERCEL_ENV === "production") return "production";
  if (!process.env.VERCEL_ENV && process.env.ALLOW_LOCAL_IN_STORE_TESTS === "true" &&
    localEndpoint(process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL) &&
    localEndpoint(process.env.RESEND_BASE_URL)) return "local";
  return null;
}

export function isMissingInStoreTable(errorCode: string) {
  return errorCode === "42P01" || errorCode === "PGRST205";
}

export const inStoreUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function readInStoreJson(request: Request): Promise<Record<string, unknown> | null> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return null;
  const value: unknown = await request.json().catch(() => null);
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
