# Event ticket options

**Status:** Approved and implemented on the feature branch on 2026-11-26. Production release is pending.

## Outcome

Staff can offer more than one named, priced ticket option on selected events. Customers can buy a mix of options in the same booking, with the event’s total capacity enforced for the whole basket.

## Verified current behaviour

- GitHub `mattymclauchlan84/pagesandpeacestore` main and the READY Vercel production deployment for `pagesandpeace.co.uk` matched at `e0c55ba970623ff24db156075f22f1f58556f612`. Vercel’s production Supabase URL points at `pigyhsjzcoofaajguzhr`.
- Create and edit expose one ticket type. Edit and duplicate load just the first ticket row. The old multi-option editor is outside the active edit route.
- The public page already lists active ticket types, and the basket keys items by ticket type ID. The page reports event-wide seats only and cannot show when one option reaches its own cap.
- A read-only production query found 14 events with multiple active ticket types. All 11 upcoming published events had exactly one active option at the time of inspection.
- The live `app_core.reserve_event_checkout` function checks each ticket type against current event capacity before it writes any bookings for the order. Two different options can each pass against the same remaining seats even when their combined quantity exceeds the event limit. The investigation inspected the function definition without calling it.

## Implemented scope

- Add a ticket-options section to the active create and edit screens. Support a name, optional description, GBP price and on-sale state per option. Share the event’s total capacity by default. Preserve existing option limits and allow staff to edit or clear them. An older sole ticket may have a limit equal to the original total capacity. Clear that option limit to let it track the shared event capacity when increasing the total. Keep series defaults single-option. Duplicate an occurrence with its active options and fresh IDs.
- Keep existing ticket IDs for edits and preserve order-line names, prices and booking history. Some existing attendance and account views display the current ticket label. Retire sold options by turning off sales. Do not delete rows referenced by bookings. Validate the event and its options together before committing changes, and keep a retry from creating extra ticket rows. Continue to require server-side admin authorisation and keep writes inside the server-only boundary.
- Show eligible options and their availability on the event page. Support mixed options in one basket. The checkout transaction must aggregate requested quantities by event and by ticket type, lock event rows in a consistent order, honour existing active reservations and refund adjustments, and reject excess quantities before writing orders or bookings. Keep the existing Stripe checkout and webhook flow.
- Use the existing tables. Apply the versioned, service-role-only migration for the reservation function and any transactional admin save needed by the design. Do not change existing production ticket rows as part of the migration. The former staging database is retired. Do not use a production-backed preview for write or payment tests.
- Actual events, ticket names, prices and any option-specific allocations will be chosen by staff. Any requested live event changes require explicit event details and production approval.

## Acceptance and verification

- Create, edit and duplicate an event with two priced options. Reload and check saved details. Turn off one option and verify historical references remain valid. Verify existing single-option events and series defaults.
- Verify the event page on desktop and mobile. Add both options to one basket and verify quantities, ticket names and prices through an isolated Stripe test checkout.
- With three seats left, verify two tickets of one type plus two of another fail as a whole and leave no order or booking. Verify a mixed basket totalling three succeeds, option-level caps are respected, a refunded quantity restores availability as before, and concurrent checkout attempts cannot oversell. Verify multi-event checkout, unauthorised writes, and retry after failure.
- Run targeted regressions, lint and build. Use isolated database fixtures and Stripe test mode for mutations. Obtain independent QA and security review before preview acceptance and production release.

## Verification on the feature branch

An isolated PostgreSQL 17 fixture passed shared-capacity, option-limit, expired-reservation, refund, retry, role, atomic-save and concurrent-checkout checks. Run the focused regression with `psql -f supabase/tests/event_ticket_capacity.sql` against an isolated migrated database.

The production build, TypeScript check and lint for changed files passed. Repository-wide lint still reports pre-existing problems. The Vercel preview points at production Supabase, so hosted verification is read-only. An isolated Stripe Test Mode checkout is required before release.

## Rollout and recovery

Release the compatible reservation fix before enabling the admin changes in production. If the application is rolled back, retain the corrected reservation logic and pause edits or duplication of multi-option events until the updated admin screens return. Do not revert to the known capacity defect while mixed-ticket bookings are possible. Production migration, deployment and any live changes to ticket listings require separate approval. Record the completed slice and verified checks in the project change log before release.
