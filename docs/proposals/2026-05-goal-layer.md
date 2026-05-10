# Feature Proposal: Goal Layer (foundational install)

**Proposed by:** Claude (per decision log 0003)
**Date:** 2026-05-08
**Status:** Approved (brief check — covered by decision log 0003)

---

## What & why

Install the goal/shape/playbook layer underneath the existing portal. Adds restaurant shape (4 dimensions), active goals (up to 3 per client from the 8-goal catalog), and goal-keyed playbooks. Reorganizes the dashboard, strategist console, and service catalog to render around active goals instead of channels. **This is the layer that turns Apnosh from a channel-organized service into a goal-led product** (per `PRODUCT-SPEC.md`).

---

## 6-point alignment check

### 1. Goal alignment

This *is* the goal layer. It's foundational infrastructure that makes every existing feature serve specific goals from the catalog (foot traffic, regulars, online orders, reservations, reputation, be-known-as, slow times, catering).

**Pass.**

### 2. Customer band

Serves Tier 2 ($300–$800/mo) directly. The shape model accommodates the full Tier 2 range without stretching to enterprise (no franchisor surface) or sub-$300 (no self-serve mechanism).

**Pass.**

### 3. Strategist role

Strategist runs the diagnostic at onboarding (sanity-checks shape, reviews/ratifies default goals). Strategist's quarterly review is the heartbeat of the goal layer. Strategist overrides feed playbook refinement. Goal layer is **strategist leverage by design** — not automation that bypasses them.

**Pass.**

### 4. Decline-to-sell risk

The goal layer makes shape-goal mismatches *visible*, which is what enables decline-to-sell in practice. Without the layer, mismatches are invisible and we sell whatever the owner asks for. With it, the strategist sees the misalignment and has the conversation. Direct enabler of cultural principle 0002.

**Pass.**

### 5. NOT violations

Reviewed against spec NOT-list:
- Channel-first SaaS: **no** — explicitly the opposite, this is what reorganizes channels around goals.
- Self-serve product: **no** — strategist still runs onboarding diagnostic.
- Marketplace: **no** — internal team executes.
- Operations platform: **no** — marketing only.
- Generalist: **no** — goal catalog and shape dimensions are restaurant-specific.
- Enterprise: **no** — `parent_client_id` reserved for future, not built.

**Pass.**

### 6. Moat compounding

Strengthens all three moat layers:
- **Trust** — visible shape-goal alignment makes "decline to sell what isn't ready" practical
- **Strategist leverage** — strategists work from a structured framework instead of ad-hoc per client
- **Playbook IP** — every override + outcome refines the matrix; this is the data substrate of the durable moat

**Pass — strongest moat alignment of any feature in the roadmap.**

---

## Verdict

**PASSES** — proceed to implementation. (Brief check; decision log 0003 already established the strategic call.)

---

## Implementation sketch

Per Phase 4 sequencing:

- **Wk 1 — Schema:** migrations for `clients.shape` (jsonb), `client_goals` (1–3 active per client, prioritized, time-bound), `goals_catalog` (the 8 goals as a typed list), `goal_playbooks` (goal × shape-modifier → service emphasis), `service_goal_tags` (services tagged with goals_served).
- **Wk 2 — Onboarding:** redesigned flow capturing shape (4 fields, 30 sec) then 8-goal selection with educational rationale per goal. Smart defaults if owner can't pick. Existing clients get strategist-driven backfill.
- **Wk 3 — Dashboard:** reorganizes around active goals. "Your goals: progress this month" replaces channel-equal-weight tabs. Channel pages become goal-contextual.
- **Wk 4 — Console + reviews:** strategist console adds goal-progress signal + shape-goal mismatch flags. Quarterly review flow stub.

Detailed schema migration draft: next.

---

## Open questions

None. Strategic calls all logged in decisions 0001–0003.
