# Tier 2 Roadmap Gap Analysis

**Date:** 2026-05-08
**Author:** Phase 2 of the Tier 2 Roadmap audit (read-only)
**Inputs:** `2026-05-portal-inventory.md` (Phase 1, confirmed), Tier 2 roadmap brief
**Audience:** Mark (founder), strategists, engineering

---

## How to read this document

Each roadmap item is scored on five axes:

- **Exists today** — what is already in the codebase that supports this item
- **Smallest viable version (SVV)** — the thinnest slice that delivers strategist leverage on day one
- **Dependencies** — schema, integrations, or upstream items that must land first
- **Effort** — S (≤1 wk one engineer), M (1–3 wks), L (1–2 mo), XL (>2 mo or multi-discipline)
- **Risk** — Low / Medium / High, with the dominant risk vector named

Effort assumes one full-time engineer plus part-time strategist input. "Risk High" means a real chance of a stalled quarter; flag early.

The roadmap is grouped by quarter as given. Each section ends with a **strategist leverage note** — the specific way this item moves a strategist from ~8 to ~20 clients.

---

## Q1 — Close the service loop

**Theme:** every promised service has a portal artifact the client can see and the strategist can mark done. No more "what did my AM do this month."

### 1.1 Service-deliverable spine (the canonical model)

**Exists today:**
- `deliverables` table (used in `/admin/today`, surfaced in `/dashboard/agenda` as "needs your review")
- `client_tasks` table (a parallel concept — assigned tasks, not deliverables)
- `client_interactions` event log
- `services` and `client_services` (Tier 2 service catalog) already wired to billing

**Gap:** there's no enforced link from `client_services.service_id` → `deliverables.service_id`. A strategist creates a deliverable freeform; nothing forces "this deliverable counts toward Service X this month." So a client paying for `social-media-management` cannot see "you got 12 posts this month under your social plan."

**SVV:**
1. Add `deliverables.service_id` (nullable) + `deliverables.cycle_month` (date, first-of-month).
2. Build `service_expectations` table: `(service_id, deliverable_type, expected_count_per_month)`. Seed for the top 8 services.
3. New view `/admin/services/[clientId]` — a matrix of months × services with delivered/expected counts and a click-through to deliverables.
4. Client-side: a "Your services this month" card on the dashboard above the agenda.

**Dependencies:** Tenancy decision (do deliverables hang off `client_id` only, or also `business_id`? Inventory §6 — recommend `client_id` only, deprecate `business_id` paths in deliverables).

**Effort:** M
**Risk:** Low — schema additions, no integration risk
**Strategist leverage:** Replaces the "what did I deliver this month" Slack thread with a single page. Saves ~30 min/client/month on retention conversations.

---

### 1.2 Review fetch + response loop (the "actually answer the reviews" service)

**Exists today:**
- `reviews` table with `posted_at`, `responded_at`, `response_text`, `sync_error`
- `/dashboard/local-seo/reviews` page with ChannelHero + list
- GMB OAuth read-only token in `channel_connections` (Inventory §7)
- Manual entry path through admin

**Gap (confirmed in Phase 1):** no automated fetcher. Strategist manually pastes reviews. This is the single biggest "feels fake" problem for clients on a $349+ plan that includes review management.

**SVV:**
1. Cron job `cron/fetch-reviews` (daily, 06:00 client local time) — pulls Google My Business reviews via the existing GMB token, upserts into `reviews` keyed on `(client_id, source, source_review_id)`.
2. Yelp deferred to Q2 (no first-party API for reviews; needs scraper or partner — separate decision).
3. Strategist UI in `/admin/reviews` already exists for response composition; just needs the inbox to fill from real data.
4. Slack/email digest to the assigned strategist when a new ≤3-star review lands.

**Dependencies:** GMB OAuth scopes audit (verify current token has `business.manage` scope, not just read-only profile). If not, re-run OAuth with broader scope.

**Effort:** M
**Risk:** Medium — Google API quotas + token refresh edge cases. Mitigation: per-client quota budgeting, exponential backoff on 429s, write `sync_error` so the connections page surfaces it.
**Strategist leverage:** Turns reviews from a "remember to check" task into a queue. A strategist managing 20 clients sees one inbox, not 20.

---

### 1.3 Strategist cross-client console

**Exists today:**
- `/admin/today` — per-client view, scoped to `?clientId=`
- `/admin/clients` — list view, no urgency signal
- `client_interactions` — has the raw signal needed for prioritization

**Gap:** an AM at 15 clients has no "what needs me today across all my clients" view. They're context-switching by tab.

**SVV:**
1. New page `/admin/console` — single table, one row per client, columns: name, plan, last contact, deliverables-due-this-week, unanswered-reviews, expiring-tokens, AI brief on what changed since yesterday.
2. Filter: "assigned to me" by default (uses `clients.assigned_strategist_id` — confirm column exists; if not, add it).
3. Sort by "needs attention" (computed score: overdue deliverables × 3 + bad reviews unanswered × 2 + token errors × 1).

**Dependencies:** `clients.assigned_strategist_id` column. May exist; if not, S to add.

**Effort:** M
**Risk:** Low
**Strategist leverage:** This is THE leverage feature. Single screen replaces 20 tabs. Estimated 45 min/day saved per strategist.

---

### 1.4 Content pipeline state machine

**Exists today:**
- `scheduled_posts` table with `status` (draft, approved, scheduled, published, failed)
- `client_updates` + `client_update_fanouts` for multi-channel publishing
- `ai_generations` log
- Approval flow exists in `/dashboard/social/calendar`

**Gap:** the states aren't formalized. A post can move from "draft" to "published" without "approved." Strategist can edit a "scheduled" post and the audit trail is fuzzy.

**SVV:**
1. Add `scheduled_posts_history` audit table (who, when, what changed). Already partially in `client_interactions` — formalize.
2. State enum migration: `draft → in_review → approved → scheduled → published | failed | canceled`. Reject invalid transitions in a DB trigger.
3. Add `requires_client_approval` boolean on `client_services` (Tier 2 plans default true).

**Dependencies:** none
**Effort:** S–M
**Risk:** Low
**Strategist leverage:** Compliance + clarity. Lets us safely auto-publish for clients who've opted into "trust mode."

---

### Q1 sequencing recommendation

Week 1–2: 1.4 (content state machine, no integrations, foundation)
Week 3–6: 1.2 (review fetch, parallel-track 1.3 starts)
Week 5–8: 1.3 (strategist console)
Week 7–11: 1.1 (service-deliverable spine — biggest of the four, builds on top)
Week 12–13: buffer + Q2 prework (POS scoping, ads scoping)

This ordering gets the strategist console live mid-quarter so the rest of Q1's work has somewhere to land.

---

## Q2 — High-leverage services

**Theme:** the services that justify the $599+ tiers — paid social, email, advanced SEO. Less "platform plumbing," more "service automation."

### 2.1 Paid social (Meta Ads) — campaign management surface

**Exists today:**
- Meta OAuth (Inventory §7, Live for Instagram/Facebook organic posting)
- `ai_generations` for ad copy
- `client_services` has `paid-social-management` SKU

**Gap:** no Marketing API integration. No campaigns table. Strategist runs ads in Meta Ads Manager directly; portal shows nothing.

**SVV:**
1. `meta_ad_accounts` table — link an ad account to a client (admin-only setup, requires `ads_management` scope).
2. Read-only sync: pull active campaigns + spend + results into `paid_campaigns` daily.
3. Client dashboard: "Paid social this month" card — spend, reach, conversions, top creative.
4. Strategist UI: campaign list + budget changer (write path, gated behind explicit per-strategist permission).

**Dependencies:** Meta OAuth re-consent for `ads_management` scope (existing tokens are organic-only). Business verification status on each client's ad account — some won't pass and need manual setup.

**Effort:** L
**Risk:** High — Meta API is fickle, rate-limited, and policy-volatile. App review for `ads_management` takes 2–4 weeks. Plan for a 4-week regulatory tail.
**Strategist leverage:** Eliminates the "screenshot ads manager into a Notion doc" workflow. Roughly 2 hr/client/month.

---

### 2.2 Email & SMS — campaign execution loop

**Exists today:**
- `/dashboard/email-sms` — overview only, no send path
- `client_updates` model for templated messaging
- No ESP integration in `channel_connections`

**Gap:** no actual send infrastructure. Klaviyo/Mailchimp aren't wired. SMS not wired (Twilio/Sinch).

**SVV:**
1. **Klaviyo first** (most restaurants are already on it via POS integrations). OAuth, sync lists + segments, send via API.
2. Campaign composition uses existing `ai_generations` pattern (already proven).
3. SMS deferred to late Q2 — add Twilio number provisioning per client only after 5+ clients ask.

**Dependencies:** legal review on TCPA compliance for SMS. ESP-vendor decision (Klaviyo vs sub-account on a parent account — affects pricing model).

**Effort:** L
**Risk:** Medium — Klaviyo API is well-documented and stable. Risk is in the multi-tenant key management.
**Strategist leverage:** Email becomes a portal workflow rather than a "log into the client's Klaviyo" workflow. Big.

---

### 2.3 Advanced local SEO — citations + tracker

**Exists today:**
- `/dashboard/local-seo` overview
- GMB read-only data
- `keyword_rankings` table (Inventory §6 — confirm; may be stubbed)

**Gap:** no citation tracker (Yelp, Tripadvisor, OpenTable presence/consistency). No keyword rank tracking automation.

**SVV:**
1. Yext or BrightLocal API integration (vendor decision needed — BrightLocal is cheaper, Yext is more accurate for restaurants). Pull citation status weekly into `citations` table.
2. Keyword rank tracking: free option = SerpApi at ~$50/mo for 100 clients × 5 keywords; paid option = DataForSEO. Recommend SerpApi to start.
3. Display matrix on `/dashboard/local-seo`.

**Dependencies:** vendor selection. Budget approval (Yext is $$$).
**Effort:** M
**Risk:** Low — read-only, no write path
**Strategist leverage:** Replaces manual citation audits done in spreadsheets. Saves ~1 hr/client/quarter.

---

## Q3 — Customer intelligence

**Theme:** know more about the client's actual customers than the client does. POS integration is the keystone.

### 3.1 POS integration (Toast first)

**Exists today:** nothing. No `pos_*` tables, no Toast OAuth.

**Gap:** total. This is the largest single piece of the year.

**SVV:**
1. **Phase A (Q3 start):** Toast OAuth + read-only sales sync. Tables: `pos_locations`, `pos_orders`, `pos_order_items`, `pos_customers`. Daily cron pulls last 24h.
2. **Phase B (mid-Q3):** customer-level aggregation. `customer_profiles` table — keyed on phone/email hash. RFM scoring (recency/frequency/monetary).
3. **Phase C (late-Q3):** "Customer intelligence" dashboard — top customers, lapsed customers, average ticket trend, day-part performance.

**Dependencies:**
- Toast partner program enrollment (~6–8 wk lead time — start in Q1!)
- A design-partner restaurant willing to be the first integration (confirmed pending Phase 1)
- PII handling review (customer phones/emails — encryption at rest, RLS audit)

**Effort:** XL
**Risk:** High — Toast API quirks, partner approval timeline, PII compliance, design-partner dependency. Multiple ways to slip a quarter.
**Mitigation:** start Toast partner enrollment Q1 week 1. Reserve 30% buffer.
**Strategist leverage:** Unlocks the "we know your customers better than you do" pitch that justifies $799 tier.

---

### 3.2 Audience export to ad/email platforms

**Exists today:** nothing.

**Gap:** this is the payoff for 3.1 — sync a "lapsed VIP" segment from POS data to Klaviyo + Meta Ads custom audiences.

**SVV:** segment builder UI (admin-only) → push to Klaviyo lists + Meta custom audiences via APIs already in place from 2.1/2.2.

**Dependencies:** 3.1 Phase B, 2.1, 2.2.
**Effort:** M (assuming dependencies land)
**Risk:** Medium — chained on three earlier integrations
**Strategist leverage:** This is the moat. Closing the loop from POS data → marketing action without humans is what Tier 2 is selling.

---

## Q4 — Margin expansion

**Theme:** make each strategist more efficient. AI does the rote work, strategist does the judgment.

### 4.1 AI-drafted strategist artifacts

**Exists today:**
- `ai_generations` infrastructure (production-ready)
- AI brief generation for dashboard
- Some draft-then-edit flows in posts

**Gap:** strategist's monthly deliverables (recap email, strategy brief, performance report) are written from scratch. Should be AI-drafted, strategist-edited.

**SVV:**
1. `report_templates` table (recap_email, monthly_brief, qbr_deck).
2. `/admin/clients/[id]/reports/new` — pick template, AI fills with last 30/90 days of data, strategist edits, sends.
3. PDF export via existing pdf-lib (Inventory §3).

**Effort:** M
**Risk:** Low — pure AI plumbing on top of existing infra
**Strategist leverage:** Cuts monthly recap from 45 min → 10 min per client. At 20 clients × 12 months = ~117 hrs/yr per strategist saved.

---

### 4.2 Onboarding automation

**Exists today:** `/admin/onboarding` exists but is form-heavy.

**Gap:** week-1 client onboarding is the most expensive strategist time. Should be 80% self-service.

**SVV:**
1. Onboarding state machine: `signed → kickoff_scheduled → assets_collected → connections_made → first_deliverable_shipped`.
2. Client-facing checklist surfaced on `/dashboard` for 30 days post-signup.
3. AI assistant for the first asset-gathering pass (logo, brand colors, voice samples).

**Effort:** M
**Risk:** Low
**Strategist leverage:** Onboarding labor drops from ~6 hr to ~2 hr per client.

---

### 4.3 Billing + plan-change self-service

**Exists today:** Stripe wired (subscriptions, invoices). No plan-change UI for clients.

**Gap:** plan upgrades/downgrades require Mark or an AM in Stripe.

**SVV:** simple `/dashboard/billing/plan` page, Stripe Customer Portal embed for changes.

**Effort:** S
**Risk:** Low — Stripe handles the hard parts
**Strategist leverage:** Removes a back-office task entirely.

---

## Cross-cutting infrastructure (not roadmap items, but enable them)

These don't appear on the quarterly roadmap but block multiple items:

| Item | Blocks | Effort | When |
|---|---|---|---|
| Tenancy consolidation (deprecate `business_id` paths in new tables) | 1.1, 3.1 | M | Q1 wk 1–3, in parallel |
| Unified action log (consolidate `client_interactions` + `client_activity_log`) | 1.3, 4.1 | S | Q1 wk 4 |
| Permissions model for strategist roles (per-client write scopes) | 1.3, 2.1, 3.2 | M | Q2 |
| OAuth token-refresh hardening (single helper, retry, sync_error surfacing) | 1.2, 2.1, 2.2, 3.1 | S | Q1 wk 2 |
| PII encryption-at-rest review | 3.1 onward | M | Q2 (before POS lands) |

These are detailed in the Phase 3 architecture doc.

---

## Risk register (top 5)

1. **Toast partner timeline (Q3)** — start enrollment Q1 wk 1, not later. The 6–8 wk lead time is a fact of life.
2. **Meta `ads_management` app review (Q2)** — submit Q1 wk 8 to clear by Q2 wk 4.
3. **Tenancy split debt (cross-cutting)** — every new feature that touches `client_id` AND `business_id` doubles in cost. Pick a side in Q1 wk 1.
4. **PII compliance (Q3)** — POS data brings phones/emails. RLS audit + encryption decision needs a security-minded set of eyes; budget 2 wks.
5. **Strategist adoption** — building the console (1.3) is half the work; getting strategists to live in it daily is the other half. Plan a "console-first" sprint with the team in Q1 wk 6.

---

## Effort summary

| Quarter | Items | Total effort | Headcount needed |
|---|---|---|---|
| Q1 | 1.1, 1.2, 1.3, 1.4 + infra | ~13 wks | 1 FT eng + 0.3 strategist |
| Q2 | 2.1, 2.2, 2.3 | ~14 wks | 1 FT eng + 0.5 strategist (heavier on 2.1) |
| Q3 | 3.1, 3.2 | ~16 wks | 1 FT eng + 0.5 design partner |
| Q4 | 4.1, 4.2, 4.3 | ~9 wks | 1 FT eng + 0.3 strategist |

Q3 is the tightest. If 3.1 slips, 3.2 doesn't ship in 2026.

---

## Confirmation needed before Phase 3

Phase 3 (architecture decisions) will be opinionated. Before I write it, confirm or correct:

1. **Q1 sequencing** — is 1.4 → 1.2 → 1.3 → 1.1 the right order, or do you want strategist console (1.3) earlier so they can use it sooner?
2. **Q2 vendor calls** — am I right to recommend Klaviyo (email), SerpApi (rank tracking), BrightLocal (citations)? Any vendor preferences/contracts I don't know about?
3. **POS** — confirmed Toast first. Design-partner restaurant identified yet, or still TBD? (Affects whether Q3 starts wk 1 or wk 4.)
4. **Headcount** — plan assumes 1 FT engineer all year. Realistic, or should I plan for a 2nd hire mid-year and re-sequence to use it?

Reply with confirmations/corrections and I'll start Phase 3.
