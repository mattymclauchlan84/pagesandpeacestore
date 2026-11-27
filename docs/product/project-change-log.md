# Project Change Log

## 2026-11-27 — Trading-year event sales

The admin event sales totals and event-type ranking use the current trading year from 1 November, matching the trading start on 1 November 2025. The ranking shows five event types per page. Percentages and bar lengths refer to the full trading-year ranking across pages. The monthly comparison still includes the previous year.

## 2026-11-27 — Admin event revenue comparison

The dashboard shows the latest 12 sale months alongside the same months a year earlier. Each month is selectable for exact net revenue, with the latest month marked as in progress. A single responsive chart keeps all months visible, including on mobile. UK calendar boundaries are used, and refunds reduce revenue in the original sale month. Event series also show their share of total net event sales.

## 2026-11-27 — SumUp refund confirmation email

The live acceptance test recorded and fully refunded an £18 SumUp order for two tickets. The booking confirmation was accepted by the mail provider. The order, both ticket lines and the refund audit reconciled, with both seats released. The SumUp preview now sends a refund confirmation using the existing Stripe refund template, with details from the committed SumUp refund. Replayed requests use the same provider key, and a failure to send leaves the refund recorded. Existing Stripe refund handling is unchanged.

## 2026-11-27 — Approved live database setup for SumUp preview acceptance

The owner approved applying the SumUp schema while keeping the app in a draft preview. After verifying the scheduled database recovery point and existing ticketing schema, the tested migration was applied as `20261127174304_sumup_in_store_event_sales`. Both tables have RLS, all four functions are executable only by the service role, and existing booking counts were identical across the migration checks. There were no SumUp sales or refunds following migration.

A temporary server-side preview exception permits the nominated admin to record sales and refunds with `TEST-` references and retry confirmation only for their own test sales. The exact feature branch and a UTC expiry are required. During that window guest linking remains restricted by the existing verified email ownership check. Staff perform the acceptance themselves using addresses they control. The live app remains on its existing release.

## 2026-11-27 — SumUp in-store event sales (development branch; not released)

The owner approved manually recording occasional completed SumUp ticket purchases in the admin dashboard, including event, ticket option/quantity, verified customer email lookup or guest booking, original payment date and reference, automatic booking confirmation emailed to every purchaser, with an optional registration link included only for guest customers. Marketing consent is excluded from the in-store checkout. The existing dashboard layout redirects new Google and magic-link customers with no recorded consent choice to /onboarding/consent (“Join the club?”). The existing callback routes remain unchanged; no duplicate consent controls are added. Only the sale date (not an invented payment time) is required. Refunds remain in SumUp; Pages & Peace records completed external refunds and capacity adjustments after staff verification. Existing child/adult and shared capacity rules remain mandatory.

Implementation is on branch feat/sumup-in-store-event-bookings-20261127, with a draft additive migration, a protected sales API/modal, guest email linking after verified signup, channel-aware reporting and an atomic multi-ticket SumUp refund reconciliation. Production database is unchanged. The preview uses production Supabase and blocks the new booking, refund, guest-link and email writes. The migration and high-consequence customer/payment flows require isolated database tests and independent review prior to approval for rollout. See [the specification](../../specs/2026-11-sumup-in-store-event-sales.md).

Independent review reproduced four blockers in the draft. The migration referenced an obsolete sale function signature, verified-email matching lacked Auth table access under the intended role, case-variant UUIDs could bypass grouped-refund checks, and temporary cancellation of Stripe seats could leave a late Stripe payment without valid tickets. The repair uses scoped SQL routines, normalised refund line IDs and sale-time rules, and preserves pending Stripe seats. Identical sale and refund retries are idempotent. Confirmation recovery uses the original sale details and the same provider key, with status in the register. Guest claiming runs in the account order read path after authentication and is disabled on production-backed previews. The sale and refund dialogs use keyboard-accessible, scrollable modals. Neither the authentication callbacks nor the consent layout changed.

The repaired migration and 14 focused scenarios passed on disposable native PostgreSQL 17.12. The checks cover permissions, verified identity, normal and rejected sales, shared limits and Stripe concurrency, late Stripe confirmation, matching and conflicting references, grouped refunds, free-ticket quantities and email-retry guards. A second reviewer ran 14 independent checks on a separate synthetic database. The Next.js routes were exercised against real PostgREST and PostgreSQL with synthetic Auth and loopback email. A simulated lost email response followed by a retry used the same key and produced one message. Direct Stripe refunds rejected a SumUp order before calling Stripe. In 390px Chromium, staff completed a synthetic grouped sale, confirmed focus restoration on Escape, and opened the SumUp-only refund dialog without horizontal clipping. Local preview-mode tests allowed read-only options and rejected sale, refund and confirmation writes.


## 2026-11-27 — Admin event-booking lookup reliability (released)

Vercel production runtime logs identified repeated `Could not load event bookings` exceptions on `/admin`. Correlated Supabase gateway logs showed five HTTP 400 responses for `/rest/v1/bookings` with 25,062-character URLs, while neighbouring queries succeeded. The production database remained healthy. The admin sales summary requested all event-order-line IDs in a single PostgREST `.in()` query.

The repair batches all five ID-based reads in the event-order report (order lines, bookings, events, ticket types and customers) into requests of at most 100 IDs. This preserves the existing mappings and fails closed if any batch fails (rather than displaying incomplete financial totals). Diagnostics log a database error code and batch index without customer or payment details. A 24-hour Supabase REST URL audit found order-line URLs as long as 24,848 characters (successful), customer URLs 7,804, ticket-type URLs 5,236 and event URLs 4,679; only bookings URLs at 25,062 characters showed the matching HTTP 400 incident. Other small HTTP 400/404 results were observed but are not evidenced as URL-length failures. Other repository query paths require a separate code-level review where applicable. No schema, reservations, booking, payment, refund or permission changes.

### Production release and acceptance
The owner navigated the updated preview's admin dashboard, booking register and refund history and reported that the pages appeared to work. PR [#53](https://github.com/mattymclauchlan84/pagesandpeacestore/pull/53) was squash-merged to `main` as commit `e5b068c11225f3c12798cf67cc3f681d832079a7` on 2026-11-27. Vercel deployment `dpl_3u1CAD82ocyd439yFqCMd7fFysTT` completed successfully (READY) and was assigned to `pagesandpeace.co.uk` and `www.pagesandpeace.co.uk`. The production build completed and a post-deployment Vercel runtime-error scan returned no error/fatal entries at the check time. An independently authenticated post-release admin session and an automated multi-batch regression test were not run; the owner subsequently reported production looked good. No Supabase production data/schema, auth permissions or payment/refund configuration changed. Follow-up: add automated multi-batch regression coverage and broaden the repository-level ID-list query audit beyond the observed 24-hour gateway logs.


This log records material product, architecture, security and delivery decisions from the engineering-governance baseline onward. Earlier rationale is **unknown / pre-baseline** unless supported by repository evidence.

## Public event availability labels

The public event list and individual booking pages show “Limited availability” when one to five places are bookable and hide the availability label above that threshold. Sold-out and unavailable states remain visible. Ticket quantity limits and the admin capacity display continue to use the actual counts.

## 2026-09-20 — Baseline v1
### Decision
Adopt a repository-based AI-assisted engineering governance model for the existing live Pages & Peace application.

### Delivery model
Significant work uses:
DISCOVER → PLAN → APPROVE → BUILD → TEST → INDEPENDENT REVIEW → PREVIEW → HUMAN ACCEPTANCE → RELEASE.

The implementer is not the sole reviewer. Human approval remains required for high-consequence actions.

### Source-of-truth model
Established `AGENTS.md`, product roadmap, this change log, slice specifications and the security model as durable project documentation alongside code/database state and Git/PR history.

### Production safety
Bootstrap is documentation/governance only. No application behaviour, database schema/data, authentication, production configuration, infrastructure, secrets or deployments are changed by this baseline.

### Verified baseline architecture
Repository: `pagesandpeace/pagesandpeacestore`.
Application: Next.js 16, React 19, TypeScript, App Router.
Backend/auth: Supabase, with legacy `public` data and a newer server-only `app_core` event-commerce schema.
Key integrations: Stripe, Resend, Cloudinary and Beehiiv. OpenAI SDK presence is known from dependencies; its active production purpose remains unverified.
Production Supabase: `pigyhsjzcoofaajguzhr`.
Staging Supabase: `ehbzvkynjcrewlzjgtkq`.
Production Vercel project: `pagesandpeacestore` in the Pages & Peace team.

### Historical evidence retained
`docs/production-app-core-cutover.md` and `docs/simple-core-rebuild.md` remain historical evidence and are not replaced by this baseline.

### Known gaps
No dedicated automated test script or repository GitHub Actions workflow was identified during baseline discovery. Branch-protection policy was not established by the discovery evidence and remains unverified. Historical rationale outside evidenced cutover documentation remains pre-baseline/unknown.

## 2026-09-20 — Community book reviews Phase 1
### Decision
Add a public reading-community feature where anyone can discover book reviews and authenticated customers can contribute reviews of any book, with optional imagery.

### Architecture
Model books separately from reviews so community content can grow into durable book pages and later reading/community features. Keep new tables inside server-only `app_core`; authenticated mutations derive ownership from Supabase Auth and execute server-side. Images reuse the existing Cloudinary boundary.

### Growth principle
Build the smallest useful community loop now while preserving expansion paths for reading lists, reactions, reviewer profiles, staff picks, event/shop relationships and recommendations. Do not prematurely build a full social network.

## 2026-09-20 — Quiet engagement and comment pagination
### Decision
Keep the book community deliberately low-noise. Reactions and reading-status changes remain useful community signals without individual email alerts. Comments are treated as conversation, but no automatic community email notifications are introduced in this stage.

### Comment-feed behaviour
Individual review pages load the latest 10 published comments initially and use cursor-based pagination to load earlier conversation on demand. This prevents long, heavy pages while preserving the full discussion history.

## 2026-09-20 — Mobile account navigation and app-shell polish
### Decision
Simplify mobile navigation and remove nested account interactions. Customer My Account links now lead directly to the account profile, the authenticated dashboard behaves as a contained app shell without the public footer, and the public event basket uses the ticket icon used elsewhere.

### UX behaviour
Mobile navigation drawers own their scrolling and lock background scroll while open. The account page no longer shows a false signed-out state while client user data is loading, and profile changes provide explicit success/error feedback.

## 2026-09-20 — Mobile menu viewport and browser-chrome refinement
### Decision
The public mobile menu is a static full-screen navigation surface rather than an independently scrolling drawer. The small number of primary destinations should remain visible at once, making the menu easier to scan and less susceptible to nested-scroll confusion.

### Mobile browser chrome
Dashboard sidebar account actions reserve additional bottom clearance beyond the CSS safe area so Settings and Sign out remain reachable above mobile browser tab/navigation controls.

## 2026-09-20 — Account entry-point refinement
### Decision
For signed-in customers, the public navbar's My Account action leads to the dashboard as the primary account landing page. The dashboard then exposes My Events, Order History, My Reviews, profile and settings through the account sidebar.

### Sidebar profile row
The sidebar profile row uses the customer's uploaded profile image (or the standard fallback avatar) as its single identity icon. A second generic avatar glyph is intentionally omitted to reduce visual duplication.

## 2026-09-20 — Event-series hero legibility
### Decision
Event-series pages must not rely on white text remaining readable over arbitrary photography. The series title and back-navigation now sit inside a translucent dark panel over the hero image, while the short description is rendered below the image on a solid page background.

### Responsive behaviour
The hero retains photography as the visual focus, but navigation/title contrast is guaranteed across mobile and desktop. Descriptive copy is separated from the image so it remains readable regardless of image brightness or crop.

## 2026-10-25 — Local SEO discovery improvements (preview)
### Decision
Improve discoverability of the existing Rossington café and events pages without creating thin location pages or changing commerce behaviour. Add `/visit` to the sitemap and page-specific canonical metadata for events and menu. Remove static structured-data opening hours that can conflict with CMS-managed hours; restore hours in structured data only through a verified single source of truth.

### Delivery and security
Implemented on `feat/seo-local-growth-audit` for preview review, not released to production. Preview now references the sole production Supabase database, so testing must avoid payments, bookings, refunds, customer communications and admin mutations. The former staging project is retired. A legacy service-role credential was exposed and requires verified revocation after replacement-key migration; environment variable updates alone do not revoke it.

## 2026-10-25 — Local content expansion (preview)
### Decision
Expand the existing `/visit` and `/events` pages with useful, non-duplicative Rossington and Doncaster discovery content rather than creating thin keyword-targeted pages. Use existing CMS-driven opening hours and live event listings as sources of truth; link readers to the menu, directions and bookings. No payment, database or customer-data changes.

## 2026-10-25 — Search Console-led local visit conversion (preview)
### Evidence and decision
The supplied Google Search Console export covers only 18–23 October 2026 despite a three-month filter. It reports 254 web impressions and 39 clicks in total, including non-branded Rossington café and Doncaster bookshop queries with impressions but no clicks. These small samples are directional, not proof of demand or ranking uplift. Prioritise improving the existing Visit and Menu pages to turn local search discovery into in-person visits, without thin location pages or speculative business details.

### Scope and acceptance
Update Visit page metadata and above-the-fold copy for local café intent, and add clear visit/directions calls to action on the existing CMS-backed Menu page. Keep opening hours CMS-driven, preserve menu loading and checkout/event flows, and make no database, auth, payment or production configuration changes. Verify responsive layout and links in preview before release; compare Search Console non-branded query clicks and GBP direction requests after 6–8 weeks, acknowledging the baseline is only six days.

## 2026-10-25 — Homepage, About and Contact local search growth (preview)
### Decision
Expand the owner-approved SEO campaign beyond the Visit/Menu conversion slice. The homepage now explicitly identifies the Rossington café/bookshop in visible content, retains the brand slogan, and foregrounds visiting. About becomes a substantial, factual introduction to the sibling-founded café/bookshop and community programme. Contact gains useful directions and CMS-sourced opening hours without altering the existing message API or business details.

### Safety and evaluation
No new thin location pages, no changes to contact submission, payments, bookings, auth or database. Test responsive layouts, metadata, navigation, menu and contact form UI without sending a message on a production-backed preview. Measure local non-branded search clicks and GBP direction requests against the short six-day Search Console baseline in roughly one month; no ranking or footfall uplift is promised.

## 2026-11-26 — Event ticket options

The product owner approved multiple ticket options on individual events. Staff can configure the name, description, price, availability and optional limit per option. Duplicating an occurrence copies its active options with fresh IDs. A series continues to offer one starting ticket as a template.

Checkout now checks the combined request against the event's shared capacity before creating a reservation. The migration keeps the existing server-only tables and the Stripe fulfilment path. Admin saves and checkout use the same event row lock. Turning an option off leaves its ticket ID, bookings and recorded order-line prices in place.

This slice requires the compatible database migration before the admin changes go live. At this point the application release and live ticket changes were pending. See the [ticket options specification](../../specs/2026-11-event-ticket-options.md) for verification and rollout.

### Production database migration

The owner approved the production database change on 2026-11-26. Supabase recorded `event_ticket_options` as version `20261126213026`. It corresponds to repository migration `20261126210541_event_ticket_options.sql`. Production verification confirmed both functions are callable by the service role and unavailable to browser roles. Read-only checks confirmed the existing Santa event ticket data was unchanged. The Vercel production application release was still pending when the migration was applied.

## 2026-11-26 — Optional child and adult event bookings

The owner approved an event-level booking rule for events such as Elvish Breakfast with Santa. Staff opt in and choose one child ticket type and one accompanying adult type. Customers select both quantities together. Checkout validates the pair per event before creating a reservation, with one place used per ticket. Other events use their existing booking flow. The implementation and tests are recorded in the [slice specification](../../specs/2026-11-child-adult-event-booking.md). The owner subsequently approved the production rollout and event activation.

### Production release and verification

Both ticketing slices went live on 2026-11-26 in commit `05b74e5f856e1e53df87a1eb2b3251a83b46c2fa` ([PR #49](https://github.com/mattymclauchlan84/pagesandpeacestore/pull/49), including [PR #50](https://github.com/mattymclauchlan84/pagesandpeacestore/pull/50)). Supabase recorded `event_child_adult_booking` as `20261126215611`, corresponding to repository migration `20261126213947_event_child_adult_booking.sql`. The rule was enabled on Elvish Breakfast with Santa after deployment. The live group form and an ordinary event picker were checked.

A Stripe Sandbox payment of £33 for two children and one adult succeeded. The owner then completed a £5 live smoke test with two Child tickets at £2 and one Parent ticket at £1. Both ticket types appeared in the account. Stripe and the app reconciled a £2 single-ticket refund and a £3 refund of the remaining tickets. All three places returned, leaving 31 available at reconciliation. Logs showed one payment confirmation, one booking email and one email per refund. Live prices were subsequently verified at £15 for Child and £3 for Parent.

### Open refund gaps

Isolated testing showed that the current admin can release a place while Stripe reports a pending refund, and that it can refund the last adult while leaving child tickets active. Neither gap occurred in the reconciled live test. The [group booking specification](../../specs/2026-11-child-adult-event-booking.md) records the operating guidance and outstanding work.
