# Optional child and adult event booking

**Status:** Released to production on 2026-11-26 with the rule enabled for Elvish Breakfast with Santa.

## Scope

The event editor can require one child ticket and one accompanying adult ticket in each booking for that event. Staff choose the two existing, distinct active ticket options. The setting starts off. Newly created and duplicated events start with ordinary booking and can opt in from Edit event. A separate database migration enables the setting in the editor.

For an enabled event, customers select their children and adults together and add them to one basket. The picker shows the price for each option and the group total. Extra active ticket types can be selected with the group. Each ticket uses one place. At the standard Elvish Breakfast with Santa prices, one child and one adult cost £18 and use two of the 31 places. Two children with one adult and one child with two adults are both valid.

The basket prompts for missing group tickets. Checkout checks the quantities again in the reservation transaction before creating an order or sending the customer to Stripe. Tickets for other events cannot satisfy this rule. Attendee slots, single-option events, order history and existing payment fulfilment continue to use the current event-commerce model.

## Data and access

The nullable `app_core.events.booking_rule` stores the selected ticket IDs. Admin saves validate that both remain on sale for the same event and use the same lock as checkout. Older admin clients can omit the rule field and retain its saved value. Service-role RPC access and existing admin authentication are retained.

## Acceptance

Verify opt-in and opt-out, selection persistence, invalid and retired selections, mobile and desktop basket UI, single-adult and single-child rejection, multiple children and multiple adults, multievent baskets, refunds and concurrent reservations. Check that a remaining capacity of one blocks group booking and keeps ordinary events bookable. Run the focused SQL regression in an isolated migrated database.

## Release and rollback

Apply the additive migration before the new app release. With the rule off, the current application can use the updated database functions. The production-backed Vercel preview is for read-only checks. Use isolated fixtures to test admin saves or reservations. Complete the required Stripe Test Mode check before the production app release.

Activate the setting on the intended event only after the customer picker is live. Review any existing bookings separately if the event has already been on sale. If the application is rolled back after activation, keep the database rule in place and coordinate how customers will use the old picker before reopening group sales.

## Verified payment and refund behaviour
The isolated Stripe Sandbox checkout completed a £33 payment for two children and one adult. The owner subsequently verified the customer account and emails on a live test purchase. Stripe and app records reconciled £5 paid and two successful refunds of £2 and £3. Three places returned to the event, and one booking email and two refund emails were recorded. See the [project change log](../docs/product/project-change-log.md).

## Refund operations and known gaps
Use Pages & Peace admin to refund a specific ticket line or all remaining tickets on the order. Successful refund quantities return the corresponding places and reduce active quantities in My Events. Order History retains the original order and refund totals.

The current rule applies at checkout. Staff must check that a partial refund leaves an accompanying adult for children who are still attending. An isolated test reproduced refunding the last adult while children's tickets remained active. A separate isolated test reproduced early release of a place while Stripe showed a refund as pending. Verify final Stripe status when reconciling and record any discrepancy. Both gaps remain open.
