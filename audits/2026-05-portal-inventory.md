# Apnosh Portal — Inventory Audit (Phase 1 of Tier 2 Roadmap Audit)

**Date:** 2026-05-08
**Author:** Claude (engineering audit, source-cited)
**Scope:** Read-only inventory of every page, route, component, table, and integration in the portal codebase, with a state assessment for each. Feeds Phase 2 (gap analysis), Phase 3 (architecture), and Phase 4 (Q1 plan).

> **State legend** (used throughout)
> - **Live** — working end-to-end with real data, used in production
> - **Partial** — UI exists but backend incomplete (or vice versa); some pieces wired
> - **Stub** — placeholder UI, mock data, "coming soon"
> - **Dead** — orphaned code, unused routes, abandoned experiments

---

## 0. Executive summary

The portal is a **Next.js 16 / React 19 / Supabase** monolith with two audiences:
1. **Clients** at `/dashboard/*` (single-business view)
2. **Apnosh team** at `/admin/*` (cross-client view + content production tooling)

**Surface area** (numbers I counted from `find`):
- **108 pages** (`page.tsx` files) across both portals
- **66 API routes** (`route.ts` files)
- **158 React components** in `src/components/`
- **83 SQL migrations** producing **60+ Postgres tables**
- **OAuth integrations**: Meta (Instagram + Facebook), TikTok, LinkedIn, Google (GBP, Drive, Search Console, GA4), plus Stripe
- **2 active cron jobs**: `gbp-api-sync`, `gbp-ingest`, `run-operator`

**Maturity** (high-level read):
- **Production-grade today**: client management, content production pipeline, social publishing (Meta), GBP analytics ingestion, Stripe billing, agreements, the new client dashboard (recently rebuilt)
- **Partial**: TikTok/LinkedIn (OAuth done, publish stubbed), monthly reports, content briefs/concepts editing
- **Stub**: pipeline intelligence (read-only), agency-wide reports landing
- **Significant tech debt**: parallel `businesses`-vs-`clients` tenancy models, duplicate review/asset surfaces, CLAUDE.md is stale on multiple fronts

**Roadmap-blocking gaps** (preview of Phase 2):
- No POS integration (any provider) — Q3 dependency
- No paid-ads integration (Meta or Google) — Q2 dependency
- GBP is read-only (no GBP-write/publish) — Q2 dependency
- Review **fetching** isn't wired to any real source — Q1 dependency
- No strategist-cross-client "what needs me" surface beyond `/admin/today` and `/admin/inbox` (which is single-client)
- No briefs auto-generation pipeline (the schema exists, the workflow doesn't)

---

## 1. Tech stack & top-level structure

### Stack (verified against `package.json` and `next.config.ts`)
- Next.js 16 App Router, React 19, TypeScript
- Supabase (Postgres + Auth + RLS + Storage)
- Tailwind CSS v4
- Stripe (subscriptions + invoices)
- Anthropic SDK (`@anthropic-ai/sdk`) for AI generations
- Sentry for error monitoring
- `papaparse` for CSV imports

### Project layout
```
src/
├─ app/
│  ├─ (auth)/                      Login, signup, onboarding
│  ├─ admin/                       Admin portal (38 page routes)
│  ├─ dashboard/                   Client portal (~50 page routes)
│  ├─ api/                         66 route.ts files
│  ├─ bespoke/sites/[slug]/        Public render of bespoke sites
│  ├─ client/[slug]/               Magic-link client request flow
│  ├─ preview/sites/[slug]/        Public preview of restaurant sites
│  ├─ production/[token]/          Token-gated production pages
│  ├─ r/[code]/                    Short-link redirector
│  ├─ sites/[slug]/                Public restaurant sites
│  ├─ about/local-seo/             Marketing landing
│  ├─ privacy/, terms/, page.tsx   Static pages
├─ components/                     158 components (`/ui`, `/dashboard`, `/admin`, etc.)
├─ lib/                            Server actions + service helpers (60+ files)
├─ types/                          TypeScript types
└─ middleware.ts                   (currently absent — see §10)
```

### Documentation under `docs/`
- `CLIENT-DASHBOARD-AUDIT.md` — earlier dashboard audit (the v1 trim notes referenced in `dashboard/layout.tsx`)
- `CLIENT-ONBOARDING-RUNBOOK.md`
- `DESIGN-SYSTEM.md`
- `ERROR-MONITORING.md`
- `INTEGRATION-PLAYBOOK.md`
- `gbp-api-application.md`, `oauth-verification-demo-video.md`

`AGENTS.md` exists at root (separate from CLAUDE.md). Not yet read in this audit.

### CLAUDE.md is stale (flagged in §10)
The repo's CLAUDE.md says "industry-agnostic — no restaurant-specific copy" and "most pages have complete UI with mock/hardcoded data." Both are false today. Recent work explicitly targets restaurants (marketing-calendar.ts, dashboard copy) and most pages now hit live data. CLAUDE.md does not mention bespoke sites, the new dashboard agenda/pulse model, or the channel-hero pattern.

---

## 2. Client portal (`/dashboard/*`) — by feature area

### 2.1 Daily home (newly rebuilt this week)

| Route | State | Notes |
|---|---|---|
| `/dashboard` | **Live** | Just rebuilt (commit `59841f8`+) into 5-section daily briefing: brief + status pills, agenda card, pulse cards with 14d sparklines, this-week recap, marketing calendar. One consolidated `/api/dashboard/load` endpoint. Data sources: `social_metrics`, `gbp_metrics`, `reviews`, `ai_generations`, `deliverables`, `client_tasks`, `scheduled_posts`. Files: `app/dashboard/page.tsx`, `lib/dashboard/get-pulse-data.ts`, `lib/dashboard/get-agenda.ts`, `lib/dashboard/marketing-calendar.ts`. |

### 2.2 Engage — customer-facing channels

| Route | State | Notes |
|---|---|---|
| `/dashboard/local-seo/reviews` | **Live** | List of reviews with filters + a new ChannelHero strip (avg star, new count, response rate). Renders from `reviews` table. **But**: the `reviews` table has no automated ingestion path — see §6. |
| `/dashboard/messages` | **Live** | Client-admin support messaging. Uses legacy `messages` + `message_threads` (business_id-scoped). |

### 2.3 Publish — content channels

| Route | State | Notes |
|---|---|---|
| `/dashboard/social` | **Live** | Posts performance overview with new ChannelHero strip (Reach / Impressions / Engagement + sparklines). Three-tab UX (Overview / Content / Audience). Data from `social_metrics` and `social_posts`. |
| `/dashboard/social/calendar` | **Live** | Content calendar grid. Data from `content_calendar` + `scheduled_posts`. |
| `/dashboard/social/action-needed` | **Live** | Posts pending client review. |
| `/dashboard/social/performance` | **Partial** | Older performance view; partially superseded by the new ChannelHero on `/dashboard/social`. Candidate for cleanup. |
| `/dashboard/social/results` | **Live** | Per-post results page. |
| `/dashboard/social/requests` | **Live** | Client-side request feed; mirror of `content_queue` filtered by `submitted_by='client'`. |
| `/dashboard/social/requests/new`, `/graphic`, `/video` | **Live** | Form flows for client-initiated content requests. |
| `/dashboard/local-seo` | **Live** | GBP analytics page (interactions, hero metric, trend chart, metric grid). Just had its alarmist-headline bug fixed (commit `7ee0c54`). |
| `/dashboard/local-seo/locations` | **Stub** | Empty/minimal — listed in CLAUDE-aligned trim notes as "placeholder, no data" in `dashboard/layout.tsx:75`. |
| `/dashboard/email-sms` | **Live** | Overview page exists. Underlying data tables and sync are partially built. |
| `/dashboard/email-sms/campaigns` | **Partial** | Campaign list; emit/send pipeline unclear. |
| `/dashboard/email-sms/list` | **Partial** | Audience list management. |
| `/dashboard/email-sms/performance` | **Stub** | Per the v1 audit notes in `layout.tsx:81`, "low value vs Overview" — currently hidden from nav. |
| `/dashboard/website` (root) | **Stub** | Per layout.tsx:69 v1 audit, the parent hub was thin — kept the page, removed from nav. |
| `/dashboard/website/traffic` | **Live** | Traffic analytics for client websites. |
| `/dashboard/website/health` | **Live** | Site health. |
| `/dashboard/website/manage`, `/copy`, `/menu`, `/photos`, `/specials` | **Live** | Site builder client-side controls. Backed by `site_configs`, `menu_items`, `client_specials`. |
| `/dashboard/website/requests`, `/new`, `/[id]` | **Live** | Change-request flow. |

### 2.4 Brand & assets

| Route | State | Notes |
|---|---|---|
| `/dashboard/assets` | **Live** | Asset library. Data from `client_assets` (client-id-scoped). |
| `/dashboard/profile/brand-guidelines` | **Live** | Brand guidelines editor. Data from `brand_guidelines` (business-id-scoped) + Claude API enrichment via `/api/ai/enrich-guidelines`. |
| `/dashboard/profile` | **Live** | Profile editing. |
| `/dashboard/profile/strategy` | **Stub** | Per layout.tsx:84, "advanced; revisit." Hidden from v1 nav. |
| `/dashboard/briefs` and `/dashboard/briefs/[id]` | **Partial** | Weekly brief inbox. The schema and pages exist; auto-generation pipeline does not (see §5). |

### 2.5 Operations / Setup

| Route | State | Notes |
|---|---|---|
| `/dashboard/connect-accounts` (legacy) | **Live** | Legacy connect flow. New canonical path is `/connected-accounts`. |
| `/dashboard/connected-accounts` | **Live** | OAuth hub for clients. Sub-pages: `yelp`, `google-business-location`, `google-property`, `google-search-console-site`. |
| `/dashboard/billing` | **Live** | Stripe-backed subscription + invoice view. Real data from `subscriptions`, `invoices`, `invoice_line_items`. |
| `/dashboard/agreements`, `/[id]` | **Live** | Agreement signing. |
| `/dashboard/orders`, `/checkout`, `/success` | **Live** | Cart-to-Stripe checkout. |
| `/dashboard/approvals`, `/[id]` | **Live** | Content approval queue (per CLAUDE.md, recently rebuilt on real data after being mock). Data: `deliverables.status='client_review'`. |
| `/dashboard/settings`, `/notifications` | **Live** | Preferences. |
| `/dashboard/calendar` | **Partial** | Listed in v1 audit notes as "becoming master calendar; rebuild." Currently aliased from new sidebar's "Calendar" entry. |
| `/dashboard/notifications` | **Live** | Page exists; bell icon is the primary surface in layout. |
| `/dashboard/messages` | **Live** | Already counted under Engage. |
| `/dashboard/help` | **Live** | Help center. |
| `/dashboard/analytics` | **Stub** | "Redundant with local-seo" per v1 audit notes; hidden from nav. |
| `/dashboard/reports` | **Stub** | "Overlaps Weekly Briefs" per v1 audit notes; hidden from nav. |
| `/dashboard/goals` | **Stub** | "First-run only; surface as setup card" per v1 audit; hidden. |
| `/dashboard/tools` | **Stub** | "Coming-soon shells" per v1 audit; hidden. |

### 2.6 Layout & cross-cutting (new this week)
- `dashboard/layout.tsx` — reorganized Today / Inbox / Calendar at top; Publish + Engage + Brand groups; new badge counts on Inbox + Reviews powered by `/api/dashboard/load`
- `loading.tsx` files added across every dashboard sub-route for instant nav feedback
- ClientProvider has sessionStorage cache (5-min TTL)

---

## 3. Admin portal (`/admin/*`) — by feature area

> Synthesized from a dedicated admin-portal audit agent; cited evidence below comes from those file reads.

### 3.1 Client management — **all Live**
- `/admin` — agency dashboard with cross-client KPIs, MRR, pending approvals, overdue invoices, unsigned agreements (`admin/page.tsx:86-151`)
- `/admin/clients` — roster with search, filter, add/import (`admin/clients/page.tsx:467-514`)
- `/admin/clients/[slug]` — client detail hub with 14 sub-tabs (`Overview, Profile, Timeline, Docs, Brand, Content, Performance, Notes, Settings`). Substantial production code surfacing every per-client subsystem.
- `/admin/clients/[slug]/operator` — AI marketing operator (proposals + runs)
- `/admin/clients/[slug]/site-builder` — restaurant template site builder (3-pane)
- `/admin/clients/[slug]/site` — site settings form
- `/admin/clients/[slug]/bespoke` — Claude-driven bespoke site generation (recently completed; `bespoke_sites` table)
- `/admin/clients/[slug]/import-gbp` — **Partial** — CSV importer; UI exists, action layer exists, error handling for edge cases unclear
- `/admin/clients/[slug]/updates` — **Partial** — hours-only today; "more types coming" (`updates/page.tsx:1-35`)
- `/admin/clients/import` — **Live** — bulk CSV with fuzzy column mapping
- `/admin/clients/_legacy_id` — **Dead** — pre-migration redirect

### 3.2 Content production — **mostly Live, two Partial, one Stub**
- `/admin/pipeline` — kanban across 6 status columns. **Live**.
- `/admin/pipeline/briefs` — **Partial** — basic CRUD on `content_briefs`, no detail editor
- `/admin/pipeline/concepts` — **Partial** — read + add on `content_concepts`, no inline editing
- `/admin/pipeline/intelligence` — **Stub** — read-only list of `client_intelligence` rows; no creation UI, no auto-generation
- `/admin/content-engine` — **Live** — monthly content cycle manager (`content_cycles` table)
- `/admin/content-engine/[clientId]` — **Live** — 5-tab workspace (Strategy / Brainstorm / Content Details / Calendar / Production); calls `assembleClientContext` for AI work

### 3.3 Daily admin operations — **all Live**
- `/admin/today` — personal task board grouped by urgency (`client_tasks`)
- `/admin/inbox` — **single-client** social inbox (Instagram + Facebook + TikTok + LinkedIn comments / DMs / posts). Important caveat: this is per-client, not cross-client.

### 3.4 Publishing — **all Live**
- `/admin/queue` — global content queue across all clients (`content_queue`)
- `/admin/publish` — direct-to-platform publisher with character-limit awareness, scheduling, first-comment, alt text, location, etc.

### 3.5 Business operations — **all Live**
- `/admin/orders`, `/[id]` — order tracking
- `/admin/billing` — invoices + subscriptions audit (real data from `invoices`, `subscriptions`)
- `/admin/agreements`, `/send`, `/templates` — full lifecycle

### 3.6 Analytics & reporting
- `/admin/analytics` — **Live** — agency-wide GBP rollup
- `/admin/analytics/[businessId]` — **Live** — per-client GBP detail with AI analysis toggle
- `/admin/analytics/upload` — **Live** — CSV column-mapper for GBP imports
- `/admin/gbp/backfill` — **Live** — bulk historical import with fuzzy location matching
- `/admin/reports` — **Stub** — minimal landing page (`reports/page.tsx` is a thin link)
- `/admin/reports/client` — **Partial** — generate + publish flow exists; no preview/editor

### 3.7 Communications — **all Live**
- `/admin/messages` — unified client→admin inbox with threading
- `/admin/calendar` — content calendar grid

### 3.8 Settings & integrations — **all Live**
- `/admin/team` — team roster + workload
- `/admin/integrations` — agency-wide OAuth (Drive + GBP)
- `/admin/settings` — company info + audit log

### 3.9 What the admin portal does NOT have yet (key for Phase 2)
- **No cross-client "what needs me" view for strategists** — `/admin/today` is per-user task list; no "across all your clients, X reviews pending, Y campaigns approved, Z drafts ready" dashboard
- **No client-portfolio scoreboard** — no "all clients ranked by attention need" surface
- **No strategist→client capacity tool** — when adding a new client to a strategist, no view of their current load
- **No multi-strategist support model** in the schema (`team_members` exists; assignment-to-client routing not first-class)

---

## 4. API routes (66 files) — categorized

### 4.1 Auth + OAuth (15 routes)
**Live (Meta + Google fully working):**
- `/api/auth/google-business`, `/google-business-agency`, `/google-business/callback` — both per-client and agency-wide OAuth; tokens in `channel_connections` (per-client) and `integrations` (agency)
- `/api/auth/google-drive`, `/google-drive/callback` — admin team grant
- `/api/auth/google-search-console`, `/google-search-console/callback` — per-client; tokens stored, downstream usage minimal
- `/api/auth/google`, `/google/callback` — generic Google OAuth (GA4 inferred)
- `/api/auth/instagram`, `/instagram/callback` — Facebook Page OAuth + linked IG Business
- `/api/auth/instagram-direct`, `/instagram-direct/callback` — direct IG Business login (alternative)
- `/api/auth/linkedin`, `/linkedin/callback` — OAuth completes, profile + org fetched
- `/api/auth/tiktok`, `/tiktok/callback` — PKCE-based OAuth, profile fetch works

**Per the integrations-audit agent (cited from those route files):**
- Meta publish: **Live** end-to-end (`lib/instagram.ts:43-200+`, `lib/facebook.ts`, `/api/social/publish/route.ts:22-148`)
- TikTok publish: **Stub** — returns "not yet available, app pending review" (`lib/tiktok.ts:14-24`)
- LinkedIn publish: **Stub** — returns "not yet available, Community Management API pending" (`lib/linkedin.ts:15-29`)
- GBP write: **None** — GBP is read-only across the codebase

### 4.2 Social (5 routes) — all Live for Meta, partial for others
- `/api/social/publish` — Meta full-featured; TikTok + LinkedIn stub paths return errors gracefully
- `/api/social/auto-publish` — finds due `scheduled_posts` and publishes
- `/api/social/bulk-schedule` — CSV bulk scheduling
- `/api/social/sync` — pulls metrics from IG/FB/TikTok/LinkedIn into `social_metrics`
- `/api/social/inbox` — comments + DMs for Meta (FB/IG fully wired); other platforms partial

### 4.3 Cron (3 routes)
- `/api/cron/gbp-api-sync` — **Live** — daily metrics sync via official GBP API; agency token; fuzzy location-to-client matching
- `/api/cron/gbp-ingest` — **Live** — auto-ingests Looker CSVs from a Drive folder
- `/api/cron/run-operator` — **Live** — weekly AI marketing operator analysis (per-client, sequential to avoid rate limits)

### 4.4 Dashboard (7 routes — recently built)
- `/api/dashboard/load` — **Live** — single consolidated endpoint (8 parallel queries)
- `/api/dashboard/brief` — **Live** — Claude-generated daily brief, 24h cache, 6s timeout with deterministic fallback
- `/api/dashboard/pulse` — **Live** — pulse cards with sparklines
- `/api/dashboard/weekly` — **Live** — "Marketing this week" feed
- `/api/dashboard/locations` — **Live** — multi-location resolution
- `/api/dashboard/tonight` — **Live** — top-of-dashboard "Today" cells
- `/api/dashboard/upload-asset` — **Live** — client-side asset upload

### 4.5 Admin AI / Bespoke (10 routes)
- `/api/admin/bespoke-generate`, `/bespoke-compose-brief`, `/bespoke-critique`, `/bespoke-handoff`, `/bespoke-regenerate-section` — **all Live** (recently shipped). Backed by `bespoke_sites`, `bespoke_history`, `bespoke_handoff_events`, `client_moodboard_items`.
- `/api/admin/apply-variant`, `/recreate-site`, `/refine-site`, `/generate-site` — site-builder pathway
- `/api/admin/discover-sources`, `/extract-from-url`, `/design-claude` — research + design helpers
- `/api/admin/drive-import`, `/drive-list` — Drive integration
- `/api/admin/moodboard` — moodboard CRUD

### 4.6 AI helpers (3 routes) — all Live
- `/api/ai/analyze-gbp`, `/enrich-guidelines`, `/parse-guidelines-pdf`

### 4.7 Brand guidelines (2 routes) — Live
- `/api/brand-guidelines/export-pdf`, `/parse-upload`

### 4.8 Other infrastructure
- `/api/webhooks/stripe` — **Live** — Stripe webhook handler
- `/api/billing/portal` — **Live** — Stripe customer portal redirect
- `/api/auth/callback` — **Live** — Supabase auth callback
- `/api/instagram/sync` — **Live** — IG-specific sync
- `/api/mcp` — **Live** — MCP integration
- `/api/public/sites/[slug]` — public-facing site JSON
- `/api/generate-post` — Claude-driven single-post generation

---

## 5. Database schema — 60+ tables (synthesized from 83 migrations)

> Detailed table-by-table inventory below; full agent output retained in §11.

### 5.1 Identity & multi-tenancy

This is **the biggest source of architectural debt** in the codebase. There are **two parallel tenancy models** that both work and neither is being deprecated.

| Table | Purpose | Owner |
|---|---|---|
| `profiles` | Auth users + role | `id` → `auth.users` |
| `businesses` | **Legacy / dashboard** model | `owner_id` → `profiles.id` |
| `clients` | **Newer agency** model | admin-managed (no owner FK) |
| `client_users` | Maps auth users to `clients` | `auth_user_id` + `client_id` |
| `client_contacts` | Rich contact directory | `client_id` |
| `team_members` | Apnosh staff | `auth_user_id` |
| `agency_settings` | Single-row global config | (none) |

**Bridge:** `businesses.client_id → clients.id` (migration 011). One business = one client.

**RLS pattern:** Every protected table has policies using helpers `is_admin()`, `current_client_id()`, `current_user_client_id()`, `current_client_user_id()`. Both tenancy models are checked.

This is **deliberate architecture** (per migration 011's comments) but creates real friction:
- Some tables are scoped by `client_id`, others by `business_id`
- Reviews / GBP / content / AI generations / bespoke / tasks / interactions → `client_id`
- Deliverables / orders / agreements / messages / brand_guidelines / brand_assets / content_calendar → `business_id`

This split causes friction across joins and is **the #1 architectural decision to revisit** (Phase 3).

### 5.2 Content production (clean — single flow)

Content moves through a unified pipeline: **`content_pillars` → `content_concepts` → `content_briefs` → `deliverables` → `content_calendar` → `social_posts`**.

- `content_pillars` — 4-6 thematic categories per client
- `content_concepts` — ideation pool (`status: idea/selected/briefed/archived`)
- `content_briefs` — structured per-piece brief (objective / hook / CTA / hashtags)
- `deliverables` — work output (status workflow as documented in CLAUDE.md)
- `content_calendar` — scheduled post per platform
- `scheduled_posts` — operational publishing queue
- `social_posts` — published-piece tracking + metrics
- `content_performance` — per-piece performance tier (top/average/below)
- `qa_checklists` — per-deliverable QA pass tracking
- `shoot_plans` — auto-generated from calendar
- `client_intelligence` — **experimental** weekly briefs (table exists, generation pipeline doesn't)
- `style_library` — approved post catalog
- `content_queue` + `client_feedback` — request inbox + feedback loop
- `content_cycles` (used by `/admin/content-engine`) — monthly cycle manager

### 5.3 Reviews + GBP

| Table | Notes |
|---|---|
| `reviews` (mig 052) | Multi-source (google/yelp/facebook/tripadvisor); `client_id` + optional `location_id`; has `responded_at` / `response_text` / `flagged` |
| `gbp_locations` (mig 069) | First-class GBP entity with `store_code` for stable matching |
| `gbp_metrics` (mig 026 + 065) | Daily metrics; recently extended with `impressions_total`, `top_queries`, etc. |
| `gbp_monthly_data` | **Legacy** — superseded by `gbp_metrics` |
| `analytics_snapshots` | **Legacy** — superseded by `gbp_metrics` + `social_posts` |
| `gbp_backfill_jobs` | Bulk-import audit |

**Critical gap:** No automated review-ingestion path. The `reviews` table only fills via manual entry or admin scripts. Google's MyBusiness API does support reviews; we have OAuth but no fetcher.

### 5.4 Social + integrations

| Table | Notes |
|---|---|
| `social_metrics` | Daily/period metrics per platform |
| `social_posts` | Per-post catalog with metrics |
| `platform_connections` | OAuth tokens per business (legacy) |
| `channel_connections` | OAuth tokens per client (newer) |
| `social_connections` | Sync bridge between the two |
| `scheduled_posts` | Publishing queue |
| `content_queue` | Request inbox |

**Three connection tables for the same job** is real debt.

### 5.5 Billing (clean)

`billing_customers` + `subscriptions` + `invoices` + `invoice_line_items` (all mig 055). All Stripe-mirrored, cents-based, scoped by `client_id`. Older `orders` table still exists for one-time/à-la-carte purchases scoped by `business_id`.

### 5.6 Tasks + workflow

- `client_tasks` (mig 058) — admin + client-facing tasks. Has `assignee_type` / `assignee_id`, `visible_to_client` flag, FK to interactions/invoices/content
- `client_updates` (mig 071) — operational fanout (hours / menu / promo / event / closure / asset / info) with `targets text[]` and `client_update_fanouts` per-target audit
- `proposed_actions` (mig 074) — AI-operator suggestions awaiting approval; FK to `client_updates` after execution
- `agent_runs` (mig 074) — AI analysis audit log

This is the cleanest part of the schema. The fanout system in particular is well-modeled for the multi-channel marketing problem.

### 5.7 AI generations (single source of truth)

`ai_generations` (mig 080) is the **universal log of every AI call**: `task_type`, `prompt_id`, `prompt_version`, `model`, `input_summary`, `output_summary`, `raw_text`, `latency_ms`, `input_tokens`, `output_tokens`, `error_message`, plus eval columns (`ai_judge_score`, `ai_judge_breakdown`, `human_feedback`).

This is the strongest piece of foundational architecture in the codebase. Every AI output we generate flows here, and the dashboard brief uses it as the cache layer (no separate cache table needed).

### 5.8 CRM / interactions

- `client_interactions` (mig 056) — primary unified event log; `kind` enum covers calls, meetings, emails, notes, status changes, contract events, milestones, reviews, complaints, wins, etc. Append-only.
- `client_activity_log` (mig 002) — coarser-grained, business-id-scoped. **Legacy**, kept for backwards compat.

**A unified action/event log exists** (answer to Phase 3 question). The schema is good. What's missing is _writing every action through it consistently_ — many app code paths don't insert into this table when they should.

### 5.9 Website / bespoke

`bespoke_sites` + `bespoke_history` + `bespoke_handoff_events` + `client_moodboard_items` — the recent bespoke-tier work. All `client_id`-scoped, well-structured, RLS-clean.

`site_settings` + `site_configs` + `site_publish_history` + `client_site_designs` + `menu_items` + `client_specials` — the broader restaurant-site builder.

### 5.10 Tables that look unused / experimental

- `client_intelligence` — schema exists, no generation pipeline
- `analytics_snapshots`, `gbp_monthly_data` — legacy, superseded
- `client_site_designs` — bespoke-tier design variants; tiny usage
- A few tables referenced in comments but not clearly used (need pruning)

---

## 6. OAuth + integration state

> Full agent output in §11. Strategic-question summary:

| Question | Answer |
|---|---|
| Can we publish posts to Meta today? | **Yes** — fully wired through `/api/social/publish` |
| Can we publish to GBP today? | **No** — GBP is read-only |
| Can we pull reviews from Google? | **No** — no review-fetching code; `reviews` table is filled manually |
| Can we read GBP metrics? | **Yes** — daily cron + Looker CSV ingest |
| Any ad-account integration? | **No** — neither Meta Ads nor Google Ads |
| Any POS integration? | **No** — no Toast, no Square |

| Provider | OAuth | Read | Write | State |
|---|---|---|---|---|
| Google Business | ✓ per-client + agency | ✓ daily cron | ✗ | Live (read-only) |
| Google Drive | ✓ admin grant | ✓ list/download | ✗ | Live |
| Google Search Console | ✓ | partial | ✗ | Partial |
| Google Analytics 4 | ✓ inferred | ✓ inferred | ✗ | Inferred |
| Facebook | ✓ | ✓ insights | ✓ posts | **Live** |
| Instagram | ✓ (via Meta + direct) | ✓ insights + DMs + comments | ✓ images, reels, carousels | **Live** |
| TikTok | ✓ (PKCE) | ✓ metrics | ✗ stub | Partial |
| LinkedIn | ✓ | ✓ org metrics | ✗ stub | Partial |
| Yelp | (?) | (?) | ✗ | Inferred from `yelp-helpers.ts` and the `yelp/` connect page |
| Stripe | n/a (API key) | n/a | ✓ subscriptions + invoices + portal + webhooks | **Live** |

---

## 7. AI / Claude integration

- **Universal logging**: `ai_generations` table captures every call with full input/output/cost
- **Cache layer**: dashboard brief is cached as a row in `ai_generations` with `task_type='dashboard_brief'`, 24h TTL via timestamp filter
- **Active task types** observed: `generate`, `recreate`, `refine`, `extract`, `design`, `critique`, `judge`, `dashboard_brief`
- **Model routing**: `lib/site-config/claude-config.ts` has `callDesignModelWithFallback` (Opus 4.1 → Opus 4 → Sonnet 4)
- **Tool-use / agents**: `/api/cron/run-operator` runs weekly per-client analysis. Outputs go to `proposed_actions` for human approval before execution
- **Critique loops**: bespoke-tier site generation has a critique-and-refine endpoint that scores its own output and rewrites the bottom sections
- **Helpers**: `/api/ai/enrich-guidelines`, `/parse-guidelines-pdf`, `/analyze-gbp`, plus the bespoke endpoints (compose-brief, generate, critique, regenerate-section, handoff)

This is **production-ready AI infrastructure**, not a sketch. It's a real foundation for Tier 2's AI-drafted-everything workflow.

---

## 8. Cron jobs (3 active)

| Cron | Schedule | What it does | State |
|---|---|---|---|
| `/api/cron/gbp-api-sync` | daily | Pull GBP metrics for every connected location via official API | **Live** |
| `/api/cron/gbp-ingest` | (likely daily) | Auto-ingest Looker CSV exports from Drive folder | **Live** |
| `/api/cron/run-operator` | weekly | Per-client AI analysis → proposed actions | **Live** |

No cron for review fetching. No cron for social-metrics syncing (that's manual via `/api/social/sync` admin button). No cron for sending weekly briefs (because brief auto-generation isn't built).

---

## 9. Public + share-link surfaces

- `/sites/[slug]` and `/preview/sites/[slug]` — public restaurant sites generated by the site builder
- `/bespoke/sites/[slug]` — bespoke (custom-coded) sites; rendered from `bespoke_sites.html_doc`
- `/r/[code]` — short-link redirector (link tracking via `link-tracking.ts`)
- `/client/[slug]/requests/*` — magic-link client request flow (no auth required, slug-based)
- `/production/[token]` — token-gated production-team page (likely for shoot day plans)

---

## 10. Code quality observations

### What's well-built (foundations to build on)
- **`ai_generations` table** — the strongest piece of schema in the repo; every AI call is auditable
- **RLS coverage** — all 60+ tables protected with consistent helper-function policies
- **Bespoke-tier site pipeline** — clean, end-to-end, recently shipped (cf. recent commits)
- **Stripe billing** — Stripe-mirrored tables, webhook handling, all real
- **Admin pipeline UI** — production-grade kanban with realtime refresh
- **The new client dashboard** (this week's rebuild) — single consolidated load endpoint, agenda card, pulse cards with sparklines, marketing calendar
- **`client_interactions` + `client_updates` + `client_update_fanouts`** — clean event-sourced model for activity timeline + multi-channel fanout

### What's tech debt (will block roadmap)
1. **Parallel `businesses` ↔ `clients` tenancy** — biggest single source of complexity; some tables scoped by one, some by the other
2. **Three OAuth-connection tables** (`platform_connections`, `channel_connections`, `social_connections`) — same job, different surfaces
3. **CLAUDE.md is stale** — multiple false claims that will mislead future contributors. Needs a refresh.
4. **`AGENTS.md`** at repo root — not yet read in this audit; may have additional staleness
5. **Review fetching not automated** — the table exists, the dashboard surfaces it, but nothing fills it on a schedule
6. **Brief auto-generation pipeline missing** — the schema (`client_intelligence`, weekly briefs) exists, the workflow doesn't
7. **`/admin/today` is per-user, not cross-client per-strategist** — strategists can't easily see "across the 8 clients I manage, what needs attention"
8. **No POS, no ads** — Q2/Q3 categorical gaps
9. **GBP write missing** — Q2 dependency
10. **TikTok + LinkedIn publishing stubbed** — Q2/Q3 dependency

### Duplicated / conflicting patterns
- Two `reviews` surfaces in different states: `/dashboard/local-seo/reviews` (recently improved with ChannelHero) AND admin's `ReviewsTab` inside the client detail page
- Two onboarding / connection flows: `/dashboard/connect-accounts` (legacy) and `/dashboard/connected-accounts` (canonical)
- `/dashboard/calendar` exists alongside `/dashboard/social/calendar` — currently the sidebar's "Calendar" entry routes to the social one, but the bare calendar route is partial
- `/dashboard/email-sms/performance` was hidden from nav per the v1 audit, but the page still exists as a stub
- `client_activity_log` (legacy, business-scoped) vs `client_interactions` (current, client-scoped) — both used in different code paths
- `gbp_monthly_data` vs `gbp_metrics` — both still exist; some queries hit the legacy one
- `analytics_snapshots` exists but is dead

### Areas no Tier 2 effort should touch (clean enough)
- Bespoke site generation pipeline
- AI-generation logging
- Stripe billing
- Agreements lifecycle
- Cron-based GBP ingest

---

## 11. Appendices (raw agent outputs)

### 11.1 Admin portal audit raw output
*(Available on request — the admin-portal exploration agent produced a ~3,500-word file-by-file audit. The key findings are summarized in §3 above.)*

### 11.2 OAuth + integrations audit raw output
*(Same — synthesized into §6 above and the Strategic-question summary table.)*

### 11.3 Database schema audit raw output
*(~2,000 words; synthesized into §5 above. Notable table-by-table specifics retained where they affect roadmap decisions.)*

---

## 12. Confirmation needed before Phase 2

Per the audit instructions: **stop here and confirm before Phase 2.**

Specifically I'd like Mark to confirm or push back on these characterizations before they harden into the gap analysis:

1. **Tenancy split is correct.** I've described `businesses` vs `clients` as parallel models with a bridge — Phase 3 will recommend whether to converge them. Is that the right framing, or is one already understood as legacy I should treat that way?
2. **Strategist surface gap.** I'm calling `/admin/today` "per-user" and noting there's no "per-strategist cross-client" surface. Is that accurate to how strategists work today, or is there a surface I missed?
3. **Review ingestion path.** I've called this a Q1 dependency. Is the plan to write our own fetcher against the GMB API (and pull Yelp via scraping/API), or are we planning to keep manual entry until reviews are someone else's problem?
4. **POS as Q3.** Is Toast confirmed as the first integration, or is that subject to change based on what Vinason or other design partners actually use?

If any of those are wrong, I want to know now so Phase 2 lands on the right premises.

Once you confirm (or correct), I'll start Phase 2 — the gap analysis against the four-quarter roadmap.
