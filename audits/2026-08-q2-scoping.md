# Q2 Scoping

**Date:** 2026-05-08 (drafted at end of Q1 build session).
**Inputs:** Phase 2 gap analysis + Q1 deliverables actually built.
**Audience:** Mark + engineering. Refresh at Q1 retro before committing.

This is a scope draft, not a week-by-week plan. The week-by-week (`2026-08-q2-execution-plan.md`) gets written at Q1 retro once we know what slipped or surprised us.

---

## Q2 theme

**High-leverage services.** The features that justify the $599+ tier — paid social, email, advanced SEO. Each one closes a workflow that today lives outside the portal.

---

## Q2 features (scoped from Phase 2)

### 2.1 — Paid social (Meta Ads)

**What it is:** read-only campaign sync + budget changer for Meta ad accounts the agency manages.

**What we have heading in:**
- Meta OAuth (Live for organic posting) — same app, but `ads_management` scope was added in wk 8 app review.
- `Connector` interface from Q1 wk 2 — the new ad connector plugs in here.
- `events` table — campaign changes write events for the console.

**SVV (smallest viable version):**
1. `meta_ad_accounts(client_id, account_id, name, status)` — link an ad account to a client (admin-only).
2. Read-only daily sync into `paid_campaigns(client_id, campaign_id, name, status, budget_cents, spend_cents, results, last_synced_at)`.
3. `/dashboard/paid` card: spend, reach, conversions, top creative this month.
4. `/admin/clients/[id]/ads` strategist view: campaign list + budget changer.

**Estimated effort:** L (5–7 wks)

**Risk:** High. Meta API is rate-limited and policy-volatile. App-review approval is the binary that determines whether this ships in Q2 at all. If approval slipped past Q1 wk 8, this is a Q3 feature, not a Q2 one.

**Decisions needed before wk 1:**
- Are we building the budget changer in v1, or read-only first then write in Q3? (Recommend: read-only v1.)
- What's the budget-change permission scope — strategists by default, or only Mark?

---

### 2.2 — Email & SMS (Klaviyo)

**What it is:** wire Klaviyo as the email engine; SMS deferred to late Q2 if 5+ clients ask.

**What we have heading in:**
- `client_updates` model for templated messaging (idle today; this gives it a home).
- `ai_generations` for copy drafting (proven in production).
- Connector interface ready.

**SVV:**
1. Klaviyo OAuth + API key per client. New connector `klaviyo` in registry.
2. List + segment sync (read-only daily) into `email_audiences`.
3. Campaign composition flow: AI draft → strategist edit → schedule → send via Klaviyo API.
4. `/admin/clients/[id]/email` campaign list.

**Estimated effort:** L (4–6 wks).

**Risk:** Medium. Klaviyo API is well-documented and stable. Risk is in the multi-tenant key management (per-client OAuth vs. one parent account with sub-accounts — vendor decision).

**Decisions needed:**
- Per-client OAuth or sub-accounts under a parent Apnosh account?
- TCPA legal review for SMS — schedule with counsel before late-Q2 SMS work.

---

### 2.3 — Advanced local SEO (citations + rank tracking)

**What it is:** citation consistency tracker (Yelp / Tripadvisor / OpenTable presence) + keyword rank tracking automation.

**What we have heading in:**
- `gbp_locations` table from Q1.
- No citation tracker. No rank-tracking cron.

**SVV:**
1. Vendor: BrightLocal (cheaper, restaurant-focused) over Yext (pricier, broader).
2. Daily cron pulls citation status into `citations(client_id, source, url, status, last_checked_at)`.
3. Rank tracking: SerpApi at ~$50/mo for 100 clients × 5 keywords. Daily cron writes `keyword_rankings(client_id, keyword, location, rank, date)`.
4. Both surface on `/dashboard/local-seo` as new sections.

**Estimated effort:** M (3–4 wks).

**Risk:** Low. Read-only, no write path.

**Decisions needed:**
- Vendor signoff (BrightLocal vs Yext).
- Per-client keyword set source — onboarding form, strategist input, or AI suggestion?

---

## Cross-cutting Q2 work

### Permissions: RBAC + assignments + capabilities (Phase 3 Decision 4)

**Why now:** strategist console is live; the next time we need finer-grained permissions is the budget changer in 2.1. If RBAC isn't in place, that ships behind a temporary admin-only flag.

**SVV:**
1. `roles` enum migration (founder, senior_strategist, strategist, junior_strategist, viewer).
2. `client_assignments(strategist_id, client_id)` — replaces the wk 7 `clients.assigned_team_member_id` single-strategist column.
3. `capabilities(role, capability)` table.
4. `can(user, capability, client_id)` Postgres helper. Replaces `is_admin()` over Q2.

**Estimated effort:** M (3 wks).

**When:** Q2 wk 1–3, in parallel with 2.3 (the lighter feature).

---

### PII compliance review (Q3 prep)

**Why now:** Q3 brings POS data — phones, emails. Need encryption-at-rest decision, RLS audit, retention policy before wk 1 of Q3.

**SVV:**
1. External security review of current schema + RLS.
2. Decision on encrypted-at-rest columns (recommend: customer phone + email hashed where possible).
3. Retention policy + deletion path.

**Estimated effort:** M (2 wks of internal work + ~2 wks external review tail).

**When:** Q2 wk 6.

---

## Suggested Q2 sequencing (pre-retro)

| Wks | Track A (1 eng) | Track B (vendors / non-eng) |
|---|---|---|
| 1–3 | RBAC migration | BrightLocal contract; Klaviyo vendor decision |
| 4–6 | 2.3 advanced SEO | PII security review starts |
| 7–10 | 2.2 email (Klaviyo) | SMS legal review |
| 11–13 | 2.1 paid social (assuming app review approved) | Q3 Toast prep |

If Meta app review slipped, swap 2.1 with the early SMS slice and push 2.1 to Q3 wk 1.

---

## Open questions for Mark

1. **Vendor approvals.** BrightLocal, SerpApi, Klaviyo — any preference, contract, or partner relationship I don't know about? Budget cap per vendor?
2. **Headcount.** Q2 estimated effort is ~17 wks of work in 13 weeks. Realistic with 1 engineer? Or do we plan for a 2nd hire mid-quarter?
3. **Meta Ads scope.** Read-only first, or budget changer in v1?
4. **SMS** — defer to Q3 if no urgent client asks, or include in Q2?
5. **PII review.** Internal-only, or budget for an external auditor (~$5–10k)?

These slot into the Q1 retro agenda. Don't commit Q2 sequencing before retro.

---

## What this doc is NOT

- A week-by-week plan. That's the retro deliverable.
- A commitment. These features survive the retro intact only if Q1 didn't surface fundamental rethinks.
- An estimate I'd defend in court. Q2 is heavier than Q1 and has more unknowns (Meta app review, vendor SLAs, PII review tail).

---

## End of audit work

This closes the strategic-planning chunk for the year. The next written artifact is the Q1 retro at week 13. Until then, the four Phase 1–4 docs + this scoping draft + the Q1 retro template are the thinking-on-paper trail.
