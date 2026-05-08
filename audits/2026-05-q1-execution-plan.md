# Q1 Execution Plan

**Date:** 2026-05-08
**Author:** Phase 4 of the Tier 2 Roadmap audit
**Inputs:** Phase 1 inventory + Phase 2 gap analysis + Phase 3 architecture decisions (all confirmed)
**Audience:** Mark + engineering + strategist team

---

## Frame

13-week plan covering 2026-05-11 through 2026-08-09 (Q1 of the Tier 2 roadmap year). Each week names: what ships, who needs to be involved, what the strategist team sees change, and the explicit dependency that makes the next week possible.

This is a commitment plan, not a Gantt chart. If a week slips, the slip flows downstream — don't compress later weeks to catch up.

Assumptions:
- 1 FT engineer
- 0.3 FTE strategist input (mostly for 1.3 console adoption + content reviews)
- Mark available ~2 hr/wk for review + decisions
- Toast partner enrollment already submitted week 1

---

## Goals for Q1 (the four-line version)

1. Every Tier 2 service has a portal artifact.
2. Strategists run their day from one cross-client console.
3. Reviews flow in automatically; responses go out from the portal.
4. The architectural foundations for Q2–Q4 are in place.

If we hit 1–3 but miss 4, Q2 stalls. If we hit 4 but miss 1–3, clients don't notice the difference. Both matter.

---

## Week-by-week

### Week 1 (May 11–17): Foundations kickoff

**Ships:**
- Tenancy audit doc (which tables key on `business_id` only vs `client_id` only vs both — output is a one-page table).
- `state_transitions` table + `enforce_state_transition()` trigger created (Decision 5).
- Toast partner enrollment submitted (kicks off 6–8 wk lead time for Q3).
- CI lint rule: new migrations with `business_id NOT NULL` require `-- TENANCY OVERRIDE` comment.

**Strategist team sees:** nothing yet.

**Mark involvement:** approve tenancy audit recommendations, sign Toast partner application.

**Dependency unlocked for week 2:** state-machine foundation lets 1.4 land cleanly; tenancy audit lets backfill start.

---

### Week 2 (May 18–24): Integration + state machine foundation

**Ships:**
- `Connector` interface defined in `src/lib/integrations/types.ts` (Decision 3).
- Meta integration refactored as the reference `Connector` implementation.
- Shared token-refresh cron walking the connector registry (replaces 4 separate refresh paths).
- Generic `transition(entity, to, actor)` app helper (uses `state_transitions` from wk 1).
- 1.4 in flight: `scheduled_posts` state enum migration drafted, `scheduled_posts_history` audit table created.

**Strategist team sees:** nothing visible. (Heads-up email: "no behavior changes; if Meta posting breaks let us know.")

**Mark involvement:** ~30 min review of `Connector` interface shape.

**Dependency unlocked:** integration foundation ready for Q2 vendor adds; state machine ready for 1.4 enforcement.

---

### Week 3 (May 25–31): 1.4 ships (content state machine)

**Ships:**
- `scheduled_posts.status` enforced enum: `draft → in_review → approved → scheduled → published | failed | canceled`.
- DB trigger rejects invalid transitions.
- `scheduled_posts_history` populated on every transition via `transition()` helper.
- `client_services.requires_client_approval` boolean (Tier 2 default true).
- Approval-required posts cannot move to `scheduled` without a transition logged.

**Strategist team sees:** the calendar's approval flow is the same UI but cleaner audit ("approved by Alice 2026-05-28 14:32"). Can no longer accidentally publish an unapproved draft.

**Mark involvement:** smoke test, sign-off.

**Risk:** an existing post in a "weird" state breaks the migration. Mitigation: dry-run migration in staging first; explicit allowlist of pre-existing values.

---

### Week 4 (June 1–7): Unified events log + GMB scope re-consent

**Ships:**
- `events` table created (Decision 2). Polymorphic shape, Zod schema per `event_type`.
- `logEvent()` writer helper. New code writes here.
- Backfill: `client_interactions` → `events` one-shot copy.
- `client_activity_log` writes deprecated (kept readable for now).
- GMB OAuth re-consent flow: bumped scopes to include `business.manage` for review responses. Email to existing clients with GMB connected: "re-authorize this week."

**Strategist team sees:** clients getting re-auth emails. Brief them so they're ready for "what's this for" questions.

**Mark involvement:** approve client-facing re-auth email copy.

**Dependency unlocked:** strategist console (1.3) has a single feed to query; review fetch (1.2) has the scope it needs.

---

### Week 5 (June 8–14): 1.2 part one — review fetch cron

**Ships:**
- `cron/fetch-reviews` daily cron (06:00 client local time).
- Pulls Google My Business reviews via the GMB token.
- Upserts into `reviews` keyed on `(client_id, source, source_review_id)`.
- Writes to `events` on every new review.
- Slack/email alert to assigned strategist when a ≤3-star review lands.

**Strategist team sees:** new reviews showing up in `/admin/reviews` automatically. Strategist no longer pastes from GMB.

**Mark involvement:** read the first week of fetched data, confirm the alert threshold.

**Risk:** GMB API quota or token-refresh edge cases. The shared refresh cron from wk 2 covers most; `sync_error` surfaces the rest on `/dashboard/connected-accounts`.

---

### Week 6 (June 15–21): 1.2 part two + console design sprint

**Ships:**
- Review-response composer in `/admin/reviews` wired to push the response back to GMB (uses the `business.manage` scope from wk 4).
- One-week console adoption sprint: Mark + 2 strategists in a room (or call) sketching the `/admin/console` shape. Output: a Figma-or-paper wireframe. **The console is half built; getting strategists to live in it daily is the other half — this sprint is when we make sure it matches their actual workflow.**

**Strategist team sees:** can respond to reviews from the portal. Are pulled into the console design call.

**Mark involvement:** lead the design sprint.

**Dependency unlocked:** clear console spec for wk 7.

---

### Week 7 (June 22–28): 1.3 part one — strategist console scaffold

**Ships:**
- New page `/admin/console` — single table, one row per client, columns from spec (name, plan, last contact, deliverables-due, unanswered reviews, expiring tokens, AI brief on what changed in 24h).
- "Assigned to me" filter using `clients.assigned_strategist_id`. (If the column doesn't exist, add it this week.)
- Reads from the unified `events` table.
- Sort by computed "needs attention" score.

**Strategist team sees:** a working console. Probably rough; soliciting feedback all week.

**Mark involvement:** day 1 walkthrough with the team.

---

### Week 8 (June 29–July 5): 1.3 part two — console hardening + Meta Ads app review submitted

**Ships:**
- Console feedback loop: address top 5 strategist asks from wk 7.
- AI-generated daily brief per client visible in console row (uses existing `ai_generations` infra).
- Token-expiration warning surfaces in console rows.
- Meta `ads_management` app review submitted. (Q2 prep — 2–4 wk review window starts now.)

**Strategist team sees:** console is now usable for daily standup. **This is the week the cultural shift happens.** Plan a strategist team meeting: "from this Monday on, your day starts in `/admin/console`, not in 20 tabs."

**Mark involvement:** lead the cultural shift meeting.

---

### Week 9 (July 6–12): Tenancy backfill phase one

**Ships:**
- Backfill `business_id`-only tables with `client_id` (using `businesses.client_id` bridge).
- Add `client_id NOT NULL` columns where missing.
- RLS policies updated to use `current_client_id()` only — drop `current_user_client_id()` from new policies.

**Strategist team sees:** nothing.

**Mark involvement:** none.

**Risk:** a Tier 1 self-serve user with no `clients` row breaks. Mitigation: identify these in wk 1 audit; create `clients` rows + `client_users` mappings for them as a one-batch migration in this week.

---

### Week 10 (July 13–19): 1.1 part one — service-deliverable spine

**Ships:**
- `deliverables.service_id` column (nullable initially), `deliverables.cycle_month`.
- `service_expectations(service_id, deliverable_type, expected_count_per_month)` table, seeded for the top 8 services.
- Backfill: existing deliverables get `service_id` based on type heuristics + manual fixup pass with strategists.

**Strategist team sees:** asked to spend ~2 hr each correcting auto-mapped deliverables.

**Mark involvement:** approve service-expectation seed values.

---

### Week 11 (July 20–26): 1.1 part two — service tracking surface

**Ships:**
- `/admin/services/[clientId]` view — months × services matrix with delivered/expected counts. Click-through to deliverables.
- Client-side "Your services this month" card on `/dashboard` above the agenda.
- Console (1.3) gets a new column: "service-month delivery status."

**Strategist team sees:** the retention conversation tool is live. Replaces the "what did we do for them this month" Slack thread.

**Mark involvement:** review with one client (test how it lands), iterate.

---

### Week 12 (July 27–Aug 2): Buffer + observability pass

**Ships:**
- Buffer for any wk 1–11 slips.
- Observability audit: error tracking, structured logging, where we lose context. Output: a follow-up backlog (2–3 items, none Q1-blocking).
- Final tenancy phase: mark `business_id` columns as deprecated. New queries hit `client_id`. Removal still scheduled for Q4.

**Strategist team sees:** nothing.

**Mark involvement:** review observability findings.

**If wk 1–11 didn't slip:** start scoping Q2 (2.1 paid social) — vendor calls, Klaviyo discovery, BrightLocal vs Yext call.

---

### Week 13 (Aug 3–9): Q1 close + Q2 kickoff

**Ships:**
- Q1 retro (engineering + strategist team): what shipped, what slipped, what we'd do differently.
- Q2 plan refresh: Phase 2 (gap analysis) gets a Q2-specific addendum based on what we learned.
- One client-facing communication: "here's what changed in the portal this quarter" — frame for retention.
- Toast partner status check (should be ~mid-review at this point).

**Strategist team sees:** the retro. Their input shapes Q2.

**Mark involvement:** lead retro, approve client communication.

---

## What changes for strategists in Q1

| Week | New thing in their day |
|---|---|
| 3 | Approval audit trail visible; can't accidentally bypass |
| 5 | Reviews show up automatically; they no longer paste |
| 6 | They respond to reviews from the portal |
| 7–8 | New cross-client console; daily standup moves there |
| 11 | Per-client service tracker for monthly retention conversations |

By end of Q1, a strategist's day is: open `/admin/console` → triage by "needs attention" → walk down the list. ~45 min/day saved per strategist (estimated from the per-client time costs in Phase 2).

---

## Sequencing rationale (why this order)

1. **Foundations first (wks 1–4).** State machine + events table + Connector interface + tenancy audit. Every later feature uses one of these. Front-loading the foundations means later weeks ship features, not foundations-mid-feature.
2. **1.4 in week 3, not later.** It's the smallest of the four Q1 features and the cleanest first user of the new state machine pattern. Ships an early visible win.
3. **Reviews (1.2) before console (1.3).** Console wants something interesting to show; review activity is the most visceral signal. Building 1.3 first would mean an empty-feeling console at launch.
4. **Console (1.3) before service spine (1.1).** Console is the daily home. Service spine adds a column to it. Building the home first lets the column feel like an addition rather than a sibling.
5. **Tenancy backfill in wk 9.** Late enough that wk 1–8 features are already on the new path; early enough to land in Q1 so Q2 doesn't inherit it.

---

## Dependencies, listed explicitly

| Item | Depends on | Why it matters |
|---|---|---|
| 1.4 (state machine) | wk 1 `state_transitions` foundation | Generic trigger reused for 5+ workflows |
| 1.2 (review fetch) | wk 4 GMB scope re-consent | Without `business.manage`, can't post responses |
| 1.3 (console) | wk 4 events table | Single feed; otherwise N-way union per console row |
| 1.1 (service spine) | wk 9 tenancy backfill | New `service_id` joins assume `client_id` canonical |
| Q2 2.1 (Meta Ads) | wk 8 app review submission | 2–4 wk review tail; submitting later = Q2 slips |
| Q3 3.1 (Toast) | wk 1 partner enrollment | 6–8 wk lead time; later = Q3 slips |

Two of these (Meta app review, Toast enrollment) start in Q1 to avoid downstream slips, even though the features land in Q2/Q3. That's deliberate.

---

## Risks (Q1-specific)

1. **Strategist console adoption (wk 7–8).** Biggest non-technical risk. Mitigated by the wk 6 design sprint and the wk 8 cultural-shift meeting. If strategists don't actually live in it, 1.3 fails its purpose even if the feature ships.
2. **GMB scope re-consent friction (wk 4).** Some clients won't re-auth quickly. Plan: an in-portal banner + AM follow-up calls. Accept that ~20% take 2+ weeks.
3. **Tenancy backfill (wk 9).** Schema migrations on a live system. Mitigation: dry run on staging first; do the migration on a Tuesday night, not Friday.
4. **Toast partner timeline (cross-cutting).** Outside our control. Mitigation: enrolled wk 1; check status wk 13; have a conditional Q3 plan if approval slips.
5. **Solo engineering risk.** One FT engineer = no redundancy. If they're out wk 7 (console launch), the cultural-shift moment is lost. Mitigate: have Mark cover wk 7 standup if needed; document the console spec well enough that the team self-serves.

---

## Open questions (for you)

These don't block Phase 4 from being a complete plan — they're decisions that come up *during* Q1 that I want flagged now:

1. **How do we handle the Tier 1 (`businesses.owner_id`) migration in wk 9?** Option A: migrate them all to `clients` rows silently. Option B: announce to them as a "your account is being upgraded" email. Recommend A — it's a no-op from their side. Confirm?
2. **GMB re-consent (wk 4) — who calls the clients?** AMs or you? Recommend AMs with a script, escalation to you if a client pushes back.
3. **Console "needs attention" scoring formula (wk 7).** Phase 2 proposed `overdue × 3 + bad reviews × 2 + token errors × 1`. Strategists may want to weight differently. Plan: ship with that formula, iterate in wk 8 based on feedback.
4. **Wk 12 buffer use.** If wk 1–11 don't slip, do you want the engineer to start Q2 work early, or take a real breather? I'd lean breather — Q2 is a heavy quarter and burnout shows up in late Q3.

---

## What success looks like at the end of Q1

- Every Tier 2 client sees a "Your services this month" card showing what was delivered against what's owed.
- Every strategist starts their day in `/admin/console`.
- Reviews flow in automatically and get responded to from the portal.
- All five architecture decisions are landed (or in their last 2 weeks).
- Q2 is unblocked: Meta Ads app review approved, Toast partner approved, Klaviyo + BrightLocal vendor selections made.

If we hit those five, this was a successful Q1 and Q2 starts on schedule.

---

## End of audit

This is the final Phase 4 deliverable. The four documents (`portal-inventory`, `tier2-gap-analysis`, `architecture-decisions`, `q1-execution-plan`) form a complete read-only audit. No code has changed.

When you're ready to start execution, the natural next step is week 1 of this plan — the tenancy audit doc and the Toast partner enrollment can both be started independently and don't require any of the other architecture pieces to be in place.

Awaiting your go-ahead before any implementation begins.
