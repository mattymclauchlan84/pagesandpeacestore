# Product Roadmap

**Baseline:** 2026-09-20  
**Status:** Draft current-state roadmap reconstructed from repository evidence. The priority ordering below requires product-owner confirmation before it should be treated as committed product direction.

This roadmap begins from the system observed at baseline. Earlier product intent is **unknown / pre-baseline** unless supported by repository evidence. It describes direction without inventing commitments.

## Product today
Pages & Peace currently supports:
- public marketing, menu/opening-hours and event discovery;
- customer signup, signin, recovery and account areas;
- per-event ticket options, optional child and accompanying adult bookings, shared event capacity, multi-event baskets and Stripe Checkout;
- booking and order history;
- administrative event, booking, attendance, refund, customer, menu and store-setting workflows;
- transactional email, newsletter integration and image handling.

The production event-commerce rebuild uses a server-only Supabase `app_core` schema while some historical/legacy information remains in `public`. The September 2026 cutover documentation remains the primary evidence for that transition.

## Draft current priorities — confirmation required
These priorities are inferred from the operational risk and recent repository work observed at baseline. They are proposed ordering, not reconstructed historical decisions.

### 1. Reliability and production safety
Maintain correct event capacity, checkout, booking, refund and historical-order behaviour. Treat payment, webhook, auth and production-data changes as high consequence.

### 2. Verification and regression protection
Increase automated coverage around authentication, basket/reservation lifecycle, Stripe checkout/webhooks, refunds, event-time conversion, historical order visibility and admin authorization. The baseline repository does not expose a dedicated automated test script.

### 3. Operational clarity
Keep admin workflows understandable and safe, particularly consequential actions. Improve diagnostics and observability without exposing secrets or customer data.

### 4. Product discoverability
Continue accurate event publishing and structured event information while preserving one source of truth for event dates/times, availability and opening hours.

### 5. Maintainable architecture
Prefer incremental changes that preserve proven architecture. Continue reconciling legacy `public` data with `app_core` only through explicit, tested slices rather than broad rewrites.

## Future intentions requiring explicit product approval
The following are not commitments until separately planned and approved:
- further legacy-schema consolidation or historical-data migration;
- new payment/refund automation;
- new customer communication automation;
- expanded AI functionality;
- material changes to authentication or authorization;
- destructive database cleanup.

## Roadmap maintenance
Every significant slice should state which confirmed roadmap objective it serves. New priorities and material scope changes must be recorded here and in the project change log.

## Confirmed product direction — Community reading
The product owner approved building a public book-review community surface on 2026-09-20. Phase 1 establishes public book/review discovery and authenticated customer contribution. The growth path is intentionally extensible toward book pages, reading lists, reactions, reviewer profiles, staff/event/shop connections and recommendations, with later phases driven by observed usage and separate approval.

## Approved local discoverability slice — 2026-10-25
Improve local discovery of the Rossington café, menu and community events with accurate page metadata, sitemap inclusion and consistent business details. Avoid speculative opening hours and thin SEO landing pages. Verify the preview, search markup and Google Search Console baseline before production release. No payment, booking or database changes are in scope.

## Approved growth campaign — 2026-10-25
The owner approved a broader Search Console-led local SEO campaign, including substantial homepage, About and Contact improvements and useful new pages where justified. Primary outcome: more in-person visits to the Rossington café/bookshop, supported by local discovery and event bookings. Prioritise existing pages and real business content over thin keyword variants. Review non-branded local search impressions/clicks and Google Business Profile direction requests after approximately one month. Preserve CMS opening hours and commerce functionality.

## Event ticketing reliability follow-ups — 2026-11-26
The live mixed-ticket purchase and sequential refunds reconciled. Isolated tests identified two open gaps for future approval. The app can release capacity while a Stripe refund is pending, and a partial refund can remove the last adult from a booking with children still attending. See the [group booking specification](../../specs/2026-11-child-adult-event-booking.md).

## Approved in-store SumUp event tickets — 2026-11-27 (development)

The owner approved a staffed admin workflow for occasional event tickets already paid through SumUp. It should create genuine capacity-reducing bookings and reconcile manual POS refunds, without Stripe charges. Match existing verified customers by email; for walk-in guests retain contact details without creating an unverified account. Automatically send one transactional confirmation email; for guests include optional registration instructions in that same email. Marketing preferences remain exclusively in the customer signup/account journey. Preserve multi-option capacity, child/adult pairing, historical financial records, original payment/refund references and UK event times. Implementation is on a separate branch and requires an isolated booking/refund regression suite, security review and separate production migration/release approval. See the [in-store sales specification](../../specs/2026-11-sumup-in-store-event-sales.md).
