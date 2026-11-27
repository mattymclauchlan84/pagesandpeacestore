# In-store SumUp event ticket sales

**Status:** Feature branch for preview; not released. Production schema changes require separate approval.

## Purpose
In-store SumUp payments must be recorded as genuine event orders and confirmed bookings, deducted from shared event and ticket-option capacity, and reconciled in the same admin dashboard and reports as online orders without charging via Stripe.

## Sale workflow
- The admin dashboard and individual event admin page include a "Record in-store sale" modal.
- Staff choose an upcoming published event, active ticket options and quantities, then enter purchaser name/email, SumUp payment reference and original sale date (no time required).
- Admin-only email lookup identifies an already verified Pages & Peace customer. Matched verified profiles link immediately; other sales remain guests without creating fictitious Auth accounts.
- No invitation or marketing choices appear at the till. Each confirmed sale automatically sends one transactional booking-confirmation email showing the event, ticket quantities, total, SumUp reference and booking reference. For guests without a verified account this email also offers optional account registration using the same verified email; registration is not needed to attend. Marketing preferences are handled solely in the customer account/sign-up journey, not the in-store sale. New Google and email-link customers are directed after verified first sign-in to the existing /onboarding/consent “Join the club?” page; they choose Yes or No there. Returning customers proceed to their requested destination. No marketing checkbox appears on sign-up or at the till. Verified login associates unlinked bookings with that email.
- Payment confirmation is explicit and manual: staff must verify settlement in SumUp before booking. A unique reference prevents duplicate entry.
- A service-role-only database RPC checks prices and event/option shared capacity and required child/adult ticket pairs under the existing event lock, and creates the sale, order lines and confirmed bookings atomically.
- Sales appear in revenue reports using the original payment date and on the attendance list/booking register marked as SumUp.

## Refund workflow
- The actual refund is always performed in SumUp first; no external payment API is called by Pages & Peace.
- The booking register reveals the original receipt reference, email and payment date to help staff locate the transaction.
- One admin modal records a complete external SumUp refund across one or more ticket types with a single refund reference and date, with separate explicit confirmation.
- A transactional refund RPC enforces remaining quantities, duplicate-reference avoidance and the accompanying-adult rule after the complete grouped refund. It records audit evidence, updated order/line refund amounts, booking statuses and released capacity together.
- SumUp orders must never display a Stripe refund action.

## Schema and security
Migration: supabase/migrations/20261127173500_sumup_in_store_event_sales.sql.
- Booking Auth user IDs become nullable for legitimate guest orders, retaining the FK for known users.
- New app_core.in_store_sales stores one reference, actual sale DATE, purchaser, administrator identity and booking confirmation delivery status. A synthetic London-noon timestamp preserves compatibility with existing order reports but must never be represented as the actual POS transaction time.
- New app_core.in_store_refunds records each completed manual POS refund and all affected lines.
- Service-role-only procedures: record_in_store_sale, record_in_store_refund and link_verified_in_store_bookings.
- New tables have RLS enabled and no direct anon/authenticated access.

## Testing and release gates
- Use an **isolated** PostgreSQL/Supabase instance and synthetic users/events for mutation tests. Do not test payments, bookings, refunds, emails or marketing subscription by writing to the sole live production database.
- Preview mutation routes are blocked. Local tests require an explicit ALLOW_LOCAL_IN_STORE_TESTS=true and a localhost Supabase URL; otherwise routes are read-only.
- Test duplicate references, retry/idempotency, prices changing during recording, fully booked events, concurrent Stripe checkout and SumUp sale, ticket-option caps, mandatory child/adult pairs and rollback after error.
- Test guest creation, existing customer match, one automatic booking confirmation for each purchaser, optional guest registration text in that email only, sign-up with verified same email and wrong-email non-linking, failure to deliver confirmation (sale remains recorded with explicit failed status), and that no marketing opt-in or Beehiiv subscription occurs from the till.
- Test whole-order and mixed child/adult refunds under one SumUp refund reference, duplicates, partial refund, remaining capacity, reconciliation and no Stripe side effects.
- Check admin reporting, customer dashboard, attendance, responsive layout and accessibility.
- Require successful build, TypeScript and applicable lint; independent QA/security review; read-only preview acceptance and separate approval for production migration and release.
- Rollback must preserve new SumUp orders, bookings and audit records; avoid destructive schema rollback.

## Not yet verified
The migration and atomic procedures have not been executed in an isolated database and external email/marketing delivery has not been exercised. A green preview build cannot substitute for those checks.
