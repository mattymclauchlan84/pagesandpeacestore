# Project Change Log

This log records material product, architecture, security and delivery decisions from the engineering-governance baseline onward. Earlier rationale is **unknown / pre-baseline** unless supported by repository evidence.

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
