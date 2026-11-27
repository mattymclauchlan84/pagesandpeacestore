# Pages & Peace — Agent Operating Rules

This repository is an existing live production system. Preserve working architecture and production behaviour unless an approved product slice explicitly requires change.

## Source of truth
1. This file: agent behaviour and delivery rules.
2. `docs/product/product-roadmap.md`: product direction and priorities.
3. `docs/product/project-change-log.md`: material decisions and changes.
4. `specs/`: exact behaviour for significant slices.
5. `docs/security/security-model.md`: permanent security and data boundaries.
6. Repository code, migrations and live verified configuration: what exists.
7. Git history and pull requests: implementation history.

Chat history is context, not a durable source of truth. Write material decisions back to the repository. Surface conflicts between documentation and implementation rather than silently choosing one.

## Delivery lifecycle
Significant work follows:

DISCOVER → PLAN → APPROVE → BUILD → TEST → INDEPENDENT REVIEW → PREVIEW → HUMAN ACCEPTANCE → RELEASE

Do not begin significant implementation before an approved plan. The implementer must not be the sole reviewer.

Roles:
- Product Architect: discovery, scope, architecture, acceptance criteria and risk.
- Developer Agent: implementation on a focused branch.
- QA Agent: independent functional/regression verification.
- Security Reviewer: auth, permissions, data, secrets, payments and abuse review where relevant.
- Release Reviewer: checks preview, migrations/config, production implications and rollback readiness.

## Standard commands
- **start the next slice**: perform discovery and product/architecture planning first. Do not immediately make significant code changes.
- **dev it**: implement the approved plan on a focused branch, then test and review it.
- **release it**: verify checks, review, preview, migrations/config, production implications and rollback before release.

## Git discipline
- Never write feature work directly to `main`.
- Use a focused branch and meaningful commits.
- Do not create noop, marker, temporary or empty-file commits.
- Review the complete diff before merge.
- Prefer squash merge for a completed meaningful slice unless history genuinely benefits from another strategy.
- Do not merge merely because a build is green.
- Preserve unrelated user changes.

## Production safety
Do not modify production data, production configuration, authentication/authorization, secrets, infrastructure, payment behaviour or destructive database state without explicit scope and approval.

Destructive database changes, material auth/security changes, production-data operations, external transfers of customer data and consequential automation require explicit human approval plus a rollback/recovery plan.

Production Supabase project `pigyhsjzcoofaajguzhr` is the sole active database. The former staging project `ehbzvkynjcrewlzjgtkq` was deleted. A Vercel preview pointed at production Supabase is for read-only checks by default. An owner-approved, individually scoped and expiring SumUp acceptance window is documented in the SumUp specification. Use an isolated database with synthetic data and Stripe Sandbox for tests that create bookings, payments, refunds, emails or admin changes.

## High-consequence actions
Keep human approval for payments/refunds, customer communications, deletion, contracts, staff decisions, security permissions and production migrations. AI-generated code is not presumed correct.

Prefer better specifications, tests, observability, least privilege and approval gates over unrestricted autonomy.

## Documentation
A significant product or architecture decision must update the relevant roadmap, change log, spec and/or security documentation in the same slice. Historical rationale that cannot be evidenced must be labelled **unknown / pre-baseline**.

Existing cutover documents are historical evidence and must not be rewritten to invent rationale.

## Current architectural constraints
The application is a Next.js/React/TypeScript App Router system using Supabase, Stripe, Resend, Cloudinary and Beehiiv. The newer `app_core` Supabase schema is designed as server-only. Browser roles must not be granted direct access merely for convenience. Service-role code bypasses ordinary browser RLS boundaries and is security-sensitive.

Event timestamps represent instants. Display UK event times using `Europe/London`; do not bulk-shift stored timestamps to compensate for BST/GMT presentation errors.

## Event ticketing
Read the [ticket options](specs/2026-11-event-ticket-options.md) and [child and adult booking](specs/2026-11-child-adult-event-booking.md) specifications when changing event commerce.

- Preserve ticket IDs and historical order lines. Check the total requested seats across all ticket types for the same event and apply any per-option limits inside the reservation transaction.
- Keep the child and accompanying adult rule opt-in per event. When enabled, require both active ticket types for that event before reserving seats. Each ticket uses one place.
- Process ticket refunds through Pages & Peace admin so amounts, ticket quantities, availability, order history and emails stay in sync. For grouped bookings, check that children who still attend have an adult ticket before issuing a partial refund. Check the Stripe refund status independently when settlement is in doubt. The current admin can treat a pending Stripe refund as complete.
- Verify customer ticket quantities, shared capacity, Stripe confirmation, partial and remaining refunds, and notification delivery for applicable changes. Record live verification separately from isolated tests and exclude customer details and Stripe identifiers.

## In-store SumUp event booking safety

Read the [SumUp in-store sales specification](specs/2026-11-sumup-in-store-event-sales.md) before modifying POS ticket recording, guest booking identities or external refund reconciliation.

- A SumUp ticket sale is an already settled payment recorded by an authorised admin, never a Stripe checkout. Do not invent or create unverified Supabase Auth users to represent guests.
- Use the existing event row lock and combined event/ticket capacity rules for a complete, atomic paid order, lines, bookings and unique POS reference. Check the SumUp amount against locked prices in the transaction. Count pending Stripe bookings until their existing lifecycle releases them. Replaying an identical SumUp reference must not reserve or release places again.
- Match a customer only by verified email. An unclaimed guest order becomes associated with an account only after the verified owner signs in with the matching address.
- Each recorded SumUp sale triggers one transactional confirmation email. Keep the original confirmation details and provider idempotency key across retries. Staff review a pending or failed confirmation in Resend after the retry window or following refunds. Guests may receive optional account-registration information in that same email, but no account is created automatically. No marketing preference or Beehiiv subscription may be set by staff at the till; customers choose via the existing /dashboard layout redirect to /onboarding/consent when marketing_consent_at is null, with Yes/No both leading to dashboard. Do not change OAuth callbacks for this or add duplicate signup-page consent controls. Retain staff identity and confirmation delivery audit status. Use actual date-only sales, never expose an invented POS payment time.
- SumUp refunds are processed in the POS first. Record externally completed grouped ticket refunds atomically under one unique refund reference. Enforce child/adult booking integrity and do not show Stripe refund actions for POS orders. Send the existing refund-confirmation template after the SumUp refund commits. An immediate email retry uses the original refund and provider key.
- The sole active database remains production. Vercel previews must not write bookings, refunds, guest ownership or confirmations except during the explicitly approved SumUp acceptance window described in the specification. Use isolated SQL fixtures and a loopback mail provider in development. Obtain explicit approval for production migrations. Preserve the SumUp records and use the feature write switch if a release must be paused.

## Admin reporting query reliability

The 2026-11-27 incident and production fix are documented in [the project change log](docs/product/project-change-log.md) (PR #53, production commit `e5b068c`).

- In `lib/app-core/event-orders.ts`, keep ID-based Supabase/PostgREST reporting lookups (orders to order lines, lines to bookings, plus events, ticket types and customers) bounded to 100 IDs per `.in()` call unless a separately verified alternative is introduced. Large URL-encoded ID arrays caused HTTP 400 errors and crashed `/admin` when booking history grew.
- Never assume a successful morning request implies that a growing query remains safe after another order. Review request URL lengths and gateway HTTP statuses when diagnosing intermittent admin failures.
- Preserve complete report results across batches; fail closed with a clear error rather than returning partially computed financial figures. Log sanitised error codes and batch numbers, not customer details or identifiers.
- When adding a new large ID-list query, assess growth, pagination/batch boundaries, the risk of truncated result sets and query error handling; test with enough synthetic IDs to exercise multiple batches.
- A 24-hour REST log audit covered observed requests, not every code path; repository-wide query audit and automated multi-batch regression coverage remain follow-up work.

## Admin event sales reporting

- The trading year starts on 1 November in Europe/London, based on the first trading day of 1 November 2025. Use the same year-to-date period for the sales totals and event-type ranking.
- Group Stripe revenue by booking creation month and SumUp revenue by recorded sale date. Deduct refunds from the original sale month.
- Keep the latest 12 months and the same months a year earlier visible in one mobile chart. Label the current month as in progress. Paginate ranked event types five at a time and calculate their shares from total year-to-date net event revenue across all pages.

## Quality
For every slice, identify relevant lint/build/tests and execute what exists. Where automated coverage is absent, document the gap and use explicit manual acceptance checks. Do not claim checks were run when they were not.

Before release, verify responsive behaviour and accessibility where UI changes are involved, and verify failure/retry/idempotency behaviour where payments, webhooks, email or data mutations are involved.
