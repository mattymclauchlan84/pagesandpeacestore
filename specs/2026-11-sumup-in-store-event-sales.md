# In-store SumUp event ticket sales

**Status:** Feature branch for preview; not released. The owner approved the additive live schema migration for preview acceptance. Public release remains subject to separate approval.

## Purpose
In-store SumUp payments must be recorded as genuine event orders and confirmed bookings, deducted from shared event and ticket-option capacity, and reconciled in the same admin dashboard and reports as online orders without charging via Stripe.

## Sale workflow
- The admin dashboard and individual event admin page include a "Record in-store sale" modal.
- Staff choose an upcoming published event, active ticket options and quantities, then enter purchaser name/email, SumUp payment reference and original sale date (no time required).
- The sale transaction matches an existing Pages & Peace profile against the current, verified Supabase Auth address. The till does not look up emails in URLs. Matched verified profiles link immediately; other sales remain guests without creating fictitious Auth accounts.
- No invitation or marketing choices appear at the till. Each confirmed sale automatically sends one transactional booking-confirmation email showing the event, ticket quantities, total, SumUp reference and booking reference. For guests without a verified account this email also offers optional account registration using the same verified email; registration is not needed to attend. Marketing preferences are handled solely in the customer account/sign-up journey, not the in-store sale. Existing Google and email-link callbacks send customers to the dashboard; the existing app/dashboard/layout.tsx then redirects customers with null marketing_consent_at to /onboarding/consent (“Join the club?”). Both Yes and No record the choice and return to the dashboard. Preserve this established flow; do not duplicate consent controls or add unnecessary callback redirects. No marketing checkbox appears on sign-up or at the till. Loading customer order history after verified sign-in associates unlinked orders and bookings with that email. The claim runs before the order query and can recover on a later dashboard visit. Authentication callbacks and the consent layout are unchanged.
- Payment confirmation is explicit and manual: staff must verify settlement in SumUp before booking. A unique, case-insensitive reference prevents duplicate entry. Replaying the same sale returns the existing order and leaves capacity unchanged. A conflicting use of the same reference fails.
- A service-role-only database RPC checks prices and event/option shared capacity and required child/adult ticket pairs under the existing event lock, and creates the sale, order lines and confirmed bookings atomically.
- Sales appear in revenue reports using the original payment date and on the attendance list/booking register marked as SumUp.

## Refund workflow
- The actual refund is always performed in SumUp first; no external payment API is called by Pages & Peace.
- The booking register shows the original receipt reference, email, sale date and confirmation status. In a failed or interrupted confirmation attempt, staff can retry from the same order. The retry uses the frozen sale details and original provider idempotency key. After 23 hours from the first attempt or after a refund, staff must review the email in Resend before any manual follow-up. A provider-accepted confirmation stays marked as sent.
- One admin modal records a complete external SumUp refund across one or more ticket types with a single refund reference and date, with separate explicit confirmation.
- A transactional refund RPC enforces remaining quantities, duplicate-reference avoidance and the sale-time accompanying-adult rule against all tickets remaining after the grouped refund. The existing Stripe reservation and refund paths still handle Stripe activity. A Stripe booking in pending status holds its place until its existing checkout lifecycle clears it. It records audit evidence, updated order/line refund amounts, booking statuses and released capacity together.
- SumUp orders must never display a Stripe refund action. A recorded partial or full refund triggers one email to the booking address using the existing refund confirmation template. The confirmation uses the committed refund amount, items and booking reference. An identical refund retry reuses the mail provider key within 23 hours. Admin sees the email outcome separately from refund success and can retry it immediately without recording another refund. Delivery can be checked later in Resend.

## Schema and security
Migration: supabase/migrations/20261127173500_sumup_in_store_event_sales.sql.
- Booking Auth user IDs become nullable for legitimate guest orders, retaining the FK for known users.
- New app_core.in_store_sales stores a unique reference, sale DATE, purchaser, administrator identity, immutable confirmation details and provider status. An internal compatibility timestamp in orders.paid_at uses London noon. Admin and customer views display the sale date only, and monthly reports use its month.
- New app_core.in_store_refunds records each completed manual POS refund and all affected lines.
- Only the service role can call record_in_store_sale, record_in_store_refund, link_verified_in_store_bookings and begin_in_store_confirmation. The two routines that resolve Auth identities have a pinned search path and grant no direct access to auth.users.
- New tables have RLS enabled and no direct anon/authenticated access.

## Testing and release gates
- Use an **isolated** PostgreSQL/Supabase instance and synthetic users/events for mutation tests. Do not test payments, bookings, refunds, emails or marketing subscription by writing to the sole live production database.
- Preview booking, refund, confirmation-retry and guest-link writes are blocked. Local mutation tests require ALLOW_LOCAL_IN_STORE_TESTS=true, loopback-only Supabase and Resend endpoints and no VERCEL_ENV.
- Test duplicate references, retry/idempotency, prices changing during recording, fully booked events, concurrent Stripe checkout and SumUp sale, ticket-option caps, mandatory child/adult pairs and rollback after error.
- Test guest creation, existing customer match, one automatic booking confirmation for each purchaser, optional guest registration text in that email only, sign-up with verified same email and wrong-email non-linking, failure to deliver confirmation (sale remains recorded with explicit failed status), and that no marketing opt-in or Beehiiv subscription occurs from the till.
- Test whole-order and mixed child/adult refunds under one SumUp refund reference, duplicates, partial refund, remaining capacity, reconciliation and no Stripe side effects.
- Check admin reporting, customer dashboard, attendance, responsive layout and accessibility.
- Require successful build, TypeScript and applicable lint; independent QA/security review; read-only preview acceptance and separate approval for production migration and release.
- Rollback must preserve all SumUp orders, bookings and audit records.

## Isolated verification

The regression suite in `tests/sumup-postgres.test.mjs` runs the migration and 14 scenarios, including concurrency between SumUp and the real Stripe reservation SQL. It starts a disposable PostgreSQL instance and constructs the baseline from repository migrations and synthetic Auth and legacy scaffolding. The file includes the dependency and execution commands. Independent security checks used a separate synthetic database. Next.js integration exercised the routes through local PostgREST and a loopback Resend stub, including retry after an accepted email response was lost. These checks did not contact payment or email providers. In 390px Chromium, staff completed a synthetic grouped sale, confirmed focus restoration on Escape, and opened the SumUp-only refund dialog without horizontal clipping. Local preview-mode tests allowed read-only options and rejected sale, refund and confirmation writes.

## Release and rollback

1. After explicit approval, confirm production project `pigyhsjzcoofaajguzhr`, the preceding ticket-option and child/adult migrations, and a usable database backup or recovery point. Compare the installed schema, roles and policies with the isolated fixture. Apply only `20261127173500_sumup_in_store_event_sales.sql` in a quiet period. Its transaction rolls back if any statement fails. Refresh the PostgREST schema cache as needed and verify the four RPC signatures, service-role execution grants, browser denial, and existing Stripe reservation and refund routing before enabling sales.
2. Release the accepted code after the database check. Smoke-test dashboard, register, customer orders and attendance. Schedule the first real SumUp sale or refund only with operator approval, and reconcile its reference, quantity, report totals and email status. For prices that changed or a sale that cannot be entered because of capacity, reconcile the existing POS payment before promising a place. Only the operator can verify settlement in SumUp.
3. If the feature needs to be paused, set `DISABLE_IN_STORE_WRITES=true` on the released application and redeploy it. This pauses SumUp writes, confirmation retries and claims while preserving source labels and history. Use a corrected compatible build for recovery. Leave the additive tables, foreign keys, procedures and nullable booking owner in place, and reconcile any in-flight POS payments from references before reopening. Do not remove the migration or restore a stale snapshot over new sales. If the migration fails before release, stop and validate the rolled-back schema before retrying.

The Vercel preview is read-only for SumUp by default. The separately approved live database acceptance window requires the exact feature branch and a preview-only `IN_STORE_PREVIEW_PILOT` value containing the nominated admin Auth UUID and a short UTC expiry, separated by a comma. The nominated admin uses `TEST-` references and addresses they control. Test sales and refunds remain in the live audit records. The kill switch or expiry closes the preview exception. Continue to use isolated fixtures for routine mutation testing.
