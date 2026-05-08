# Tenancy Audit (Q1 wk 1 deliverable)

**Date:** 2026-05-08
**Source:** Phase 4 Q1 plan, week 1.
**Inputs:** All migrations 001–083.
**Decision frame:** Phase 3 Decision 1 — consolidate on `clients`.

---

## TL;DR

- **126 scoped tables.** 87 are `client_id`-only (already Tier 2 native), 24 are `business_id`-only (legacy), **0 carry both** as direct FKs.
- **No table actively dual-keys.** The bridge lives only on `businesses.client_id`. This is better news than expected — the duplication is in *RLS policies* (which read both helpers), not in row-level data.
- **7 legacy blockers** carry `business_id NOT NULL`: `subscriptions`, `orders`, `invoices`, `agreements`, `brand_guidelines`, `client_intelligence`, `gbp_monthly_data`. None block Q1 features.
- **One real critical-path issue:** `deliverables` is **`business_id NOT NULL`, no `client_id`**. This is a blocker for Q1 1.1 (service-deliverable spine, wk 10). Must be addressed before then.

---

## Counts

| Category | Count |
|---|---|
| `ONLY_CLIENT_ID` | 87 |
| `ONLY_BUSINESS_ID` | 24 |
| `BOTH` (direct FK on the same row) | 0 |
| Total scoped | 111 + 15 sundry |

---

## Critical Tier 2 tables (all `client_id`-native unless flagged)

| Table | Tenancy | Migration | Notes |
|---|---|---|---|
| `deliverables` | **`business_id` NOT NULL, no `client_id`** | 001 | **BLOCKER for 1.1.** Add nullable `client_id`, backfill via `businesses.client_id`, ship before wk 10. |
| `scheduled_posts` | `client_id` NOT NULL | 023 | Tier 2 ready. First user of state machine in wk 3. |
| `ai_generations` | `client_id` nullable | 080 | Nullable supports system/admin generations. Fine. |
| `channel_connections` | `client_id` NOT NULL | 043 | Tier 2 ready. |
| `reviews` | `client_id` NOT NULL | 013 | Tier 2 ready. Wired for wk 5 review-fetch cron. |
| `client_interactions` | `client_id` NOT NULL | 056 | Tier 2 ready. Backfilling into `events` in wk 4. |
| `client_tasks` | `client_id` NOT NULL | 058 | Tier 2 ready. |
| `client_services` | `client_id` NOT NULL | 015 | Tier 2 ready. |
| `email_campaigns` | `client_id` NOT NULL | 014 | Tier 2 ready. (Q2 vendor wiring on top.) |
| `social_posts` | `client_id` NOT NULL | 054 | Tier 2 ready. |
| `graphic_requests` / `video_requests` | `client_id` NOT NULL | 016 / 019 | Tier 2 ready. |
| `content_calendar_items` / `content_cycles` | `client_id` NOT NULL | 027 | Tier 2 ready. |
| `client_profiles` | `client_id` NOT NULL | 043 | Tier 2 ready. |
| `search_metrics` | `client_id` NOT NULL | 045 | Tier 2 ready. |
| `weekly_briefs` | `client_id` NOT NULL | 049 | Tier 2 ready. |
| `proposed_actions` / `agent_runs` | `client_id` NOT NULL | 074 | Tier 2 ready. |
| `site_configs` / `bespoke_sites` | `client_id` nullable | 079 / 081 | Nullable for service-level defaults. Fine. |

---

## `business_id` NOT NULL legacy holdouts (7)

None block Q1. All are billing/governance tables that historically scoped to `business_id`. Recommended treatment per Phase 3 Decision 1:

| Table | Action |
|---|---|
| `subscriptions` | Q4 — superseded by `billing_customers` (055). Migrate Tier 1 self-serve users in wk 9 backfill. |
| `orders` | Q4 — same. |
| `invoices` | Q4 — same. New invoices already keyed via `billing_customers.client_id`. |
| `agreements` | Q4 — archive. Tier 2 contracts ship through Stripe + a new `client_agreements` if needed. |
| `brand_guidelines` | Q2 — needs `client_id` for the wk 6 brand-merge work. Backfill in wk 9. |
| `client_intelligence` | Q4 — internal-only. Archive. |
| `gbp_monthly_data` | Already deprecated by migration 026. Mark read-only in wk 9. |

---

## Action items for the rest of week 1

1. **Add `client_id` to `deliverables`.** Migration 085 (next). Nullable column, backfill from `businesses.client_id`, leave `business_id` in place for now. **This is the only Q1-blocking schema change.**
2. **CI lint rule:** new migrations with `business_id NOT NULL` require an explicit `-- TENANCY OVERRIDE: <reason>` comment. Implementation: a small node script in `scripts/check-migrations.ts` run from `package.json` `pretest` or `prebuild`.
3. **No other action this week.** The 7 legacy holdouts are scheduled (table above). The 87 client-id-native tables are already correct.

---

## Risk callouts surfaced by the audit

- **Mass RLS rewrite is bigger than the schema rewrite.** Migrations 026 and 043 establish `current_client_id() OR current_user_client_id()` as a dual-access pattern across many policies. Phase 3 Decision 1 calls for dropping the latter from new policies — but the *existing* policies need a sweep too. Estimate: 1 engineer-day in wk 9 alongside the backfill.
- **`platform_connections` (021) is the one mixed table.** It has `business_id` (legacy) AND `client_id` (added later) on the same row, but neither marked NOT NULL. Easy fix in wk 9: enforce `client_id NOT NULL`, drop `business_id`.
- **`bespoke_sites` and `site_configs` keep `client_id` nullable.** Intentional (service-level defaults). Don't tighten without a closer look at the bespoke-site code path.

---

## Recommendation

Decision 1 holds. The audit is mostly good news — there's no widespread dual-keyed data, just a tail of legacy billing tables and one critical-path miss (`deliverables`).

Next migration (085): add `client_id` to `deliverables`. Then ship the CI lint rule. Week 1 done.
