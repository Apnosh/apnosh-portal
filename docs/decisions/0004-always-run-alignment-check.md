# 0004 — Always run the 6-point alignment check (no exemptions)

**Date:** 2026-05-08
**Status:** Accepted
**Decided by:** Mark + Claude

## Context

The 6-point alignment check (per `WORKING-AGREEMENT.md`) prevents feature drift from `PRODUCT-SPEC.md`. Question raised: should foundational work already approved via a decision log be exempt from the check, or should the check run regardless?

## Decision

**The 6-point check runs on every feature proposal. No exempt categories.**

The check varies in depth based on the work:

- Foundational work covered by an existing decision log: brief check, ~6 bullets confirming alignment. 2 min.
- New feature not previously discussed: full template, careful answers. 15 min.
- Migrations or sub-tasks within an already-approved feature: no separate check; the feature's check covers them.

The check is at the **feature proposal** level, not every commit.

## Reasoning

The 6-point check has two functions:

1. **Gate function** — prevent drift before code is written. Decision logs serve this for big strategic calls.
2. **Habit function** — keep the spec alive in daily working memory. Decision logs don't serve this; they're written once, rarely re-read.

Option 2 (skip when a decision log covers it) preserves the gate function but loses the habit function exactly on foundational work — which is the work where alignment matters most.

The asymmetry of failure modes:
- Option 1 worst case: mild ceremony.
- Option 2 worst case: alignment drift unnoticed for months.

Plus: exempt categories tend to grow over time. "Decision log covers it" → "similar to log work" → "we're moving fast." Alignment systems decay through exemption creep, not through any single bad call.

## Alternatives considered

- **Skip check for decision-log-covered work** (Option 2). Rejected — see reasoning above.
- **Run check only on user-facing features.** Rejected — backend/architecture decisions can drift the spec just as much (e.g., a Connector interface that subtly biases toward channel-first thinking).
- **Run check only when Claude is unsure.** Rejected — makes alignment dependent on Claude's judgment of when to invoke the brake; the brake should be hardest to bypass when bypassing it benefits the brake operator.

## Consequences

- The check runs ~weekly when feature work is active. ~5–15 min each. Manageable overhead.
- "Brief check" mode (for clearly aligned work) keeps ceremony low.
- The first real use is the goal layer build itself (next).
- If the check ever feels rote, that's a signal to revise this decision — not to skip the check.
