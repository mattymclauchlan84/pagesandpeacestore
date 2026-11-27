import "server-only";

function localEndpoint(value: string | undefined) {
  return Boolean(value && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/i.test(value));
}

const pilotBranch = "feat/sumup-in-store-event-bookings-20261127";
const testReference = /^TEST-/i;

function activePreviewAdmin() {
  if (process.env.VERCEL_ENV !== "preview" || process.env.VERCEL_GIT_COMMIT_REF !== pilotBranch) return null;
  const [id, until] = (process.env.IN_STORE_PREVIEW_PILOT ?? "").split(",");
  if (!inStoreUuid.test(id) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(until ?? "")) return null;
  const expiry = Date.parse(until);
  const now = Date.now();
  return expiry > now && expiry - now <= 3 * 60 * 60 * 1000 ? id.toLowerCase() : null;
}

export function inStoreWriteMode(adminId?: string) {
  if (process.env.DISABLE_IN_STORE_WRITES === "true") return null;
  if (process.env.VERCEL_ENV === "production") return "production";
  if (adminId && activePreviewAdmin() === adminId.toLowerCase()) return "preview-pilot";
  if (!process.env.VERCEL_ENV && process.env.ALLOW_LOCAL_IN_STORE_TESTS === "true" &&
    localEndpoint(process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL) &&
    localEndpoint(process.env.RESEND_BASE_URL)) return "local";
  return null;
}

export function previewPilotAdminForGuestClaim() {
  return process.env.DISABLE_IN_STORE_WRITES === "true" ? null : activePreviewAdmin();
}

export function isInStoreTestReference(reference: string) {
  return testReference.test(reference);
}

export function isPreviewPilotSale(
  sale: { sumup_reference: string; created_by_auth_user_id: string },
  adminId: string,
) {
  return sale.created_by_auth_user_id === adminId && isInStoreTestReference(sale.sumup_reference);
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
