# Q1 Code → Goal Layer Reconciliation

**Date:** 2026-05-08
**Status:** Active reference for goal layer build
**Bottom line:** Q1 code mostly survives the goal-led reframe. The goal layer is largely **additive**, not replacement. Three small things need rework. One small thing gets retired.

---

## What survives unchanged

These pieces are infrastructure or workflow that don't depend on channel-vs-goal organization:

| Piece | Why it survives |
|---|---|
| `state_transitions` + `enforce_state_transition()` (mig 084) | Generic state-machine pattern. Reused by all 5+ workflowed entities, regardless of how the product is organized. |
| `transition()` helper | Same. |
| `events` table + `logEvent()` (mig 087) | Polymorphic audit log. Goal events plug in alongside scheduled-post and connection events. |
| `Connector` interface + registry | Generic OAuth lifecycle. Each provider serves whatever goals its services serve. |
| Meta + GBP connectors | Provider implementations; data they fetch feeds whichever goal needs it. |
| Daily crons (refresh-tokens, fetch-reviews) | Infrastructure. Cron output writes events; events feed goal-progress signals. |
| `respondToReview()` server action | Implements a deliverable that serves the "better online reputation" goal. Tag it with that goal once tagging exists. |
| `scheduled_posts` state machine + history (mig 086) | Content workflow. Each post will gain a `goal_id` link in the goal layer build, but the workflow itself is right. |
| Workflow helpers (`submitForReview`, `approvePost`, etc.) | Same. |
| `deliverables.client_id` (mig 085) | Tenancy fix. Unrelated to goal-led. |
| Tier 1 backfill (mig 090) | Tenancy. |
| `brand_guidelines.client_id` | Tenancy. |
| `client_services` table (mig 089) | Subscription record. Gains a `goals_served` array via tag join, but the table itself is right. |
| Tenancy lint rule | Process infrastructure. |

---

## What needs minor revision (during goal layer build, not before)

### 1. `service_expectations` (mig 091)

**Today:** `(service_slug, deliverable_type, expected_count_per_month)` — describes baseline volume per service.

**Goal layer addition:** new table `goal_playbooks(goal_slug, shape_modifier, service_emphasis)` — describes recommended service mix per goal × shape combination.

**Resolution:** keep both. `service_expectations` stays as the baseline ("when this service is active, this is the standard delivery volume"). `goal_playbooks` overlays goal-driven priority ("for this goal × shape, emphasize these services"). They serve different questions and don't conflict.

**Cost:** zero rework. Additive only.

---

### 2. Service-delivery matrix at `/admin/services/[clientId]`

**Today:** table of services × cycle months showing delivered/expected.

**Goal layer addition:** new `/admin/goals/[clientId]` view showing goal-progress over time. The services view becomes a sub-detail accessible from the goal view ("how did we deliver against this goal? — see services that contributed").

**Resolution:** add the goal view as primary; keep the services view as drill-down. Same data, two surfaces.

**Cost:** ~3 days during goal layer wk 3.

---

### 3. Sidebar navigation + dashboard channel pages

**Today:** sidebar groups channels (Posts / Local SEO / Email & SMS / Website / Reviews). Dashboard treats them as equal-weight tabs.

**Goal layer revision:** sidebar stays mostly the same (channels are real and useful for browsing), but the **dashboard reorders by active goals' lever emphasis**. A client with `more_foot_traffic` goal lands on local-SEO content first; a client with `build_brand` lands on social/content first.

**Resolution:** dashboard ordering becomes a goal-priority function. Channel pages survive as-is — they're contextual surfaces, not the primary navigation.

**Cost:** ~2 days during goal layer wk 3.

---

## What gets retired (the only thing)

**`ServicesThisMonth` dashboard component.** Built last week. Shows delivered/expected per service for the current month.

**Goal layer replacement:** `GoalsProgress` component — shows progress against active goals for the current quarter. Same visual shape (cards with progress bars), different data source (goals vs services).

**Resolution:** retire `ServicesThisMonth`. Replace with `GoalsProgress` during goal layer wk 3. The component is ~2 days old; minimal sunk-cost.

**Cost:** ~1 day to rebuild as goal-keyed.

---

## What this means for the goal layer build

The 4-week plan stays at 4 weeks. The reconciliation is folded into existing weeks:

| Goal layer wk | Original plan | Reconciliation work added |
|---|---|---|
| 1 — Schema | shape, goals, playbooks, tags | service_goal_tags adds tags to existing services |
| 2 — Onboarding | shape + goals capture | Existing clients get strategist-driven backfill |
| 3 — Dashboard | reorganize around goals | `ServicesThisMonth` → `GoalsProgress` swap; channel-page reordering |
| 4 — Console + Q-review | goal-progress column, Q-review stub | `/admin/services/[id]` becomes drill-down from new `/admin/goals/[id]` |

No surprises. The reframe is compatible with what we built.

---

## What this confirms

The Q1 work was foundational enough that a strategic pivot didn't break it. That's a retroactive validation of the architecture decisions (Phase 3) — keeping the infrastructure generic + the workflow-state pattern + the events log meant the channel-vs-goal organization could swing without rewriting the substrate.

If we'd built channel-specific tables (`social_post_metrics`, `email_campaign_history` as separate hand-rolled audits) we'd be facing 6+ weeks of rework right now. We're facing zero. That's the value of the abstractions — not visible until something tries to break them.

Worth remembering when the next "we should just hand-roll this" temptation arrives.
