# 0001 — Eight-goal catalog (not 10)

**Date:** 2026-05-08
**Status:** Accepted
**Decided by:** Mark + Claude

## Context

The product needs a goals catalog as the steering wheel — owners pick goals, Apnosh translates to a service mix. Initial draft had 10 goals, including "open another location" and "sell or hand off the business."

## Decision

The catalog has **8 goals**, all phrased in owner voice and all directly marketing-actionable:

1. More foot traffic
2. My regulars come back more often
3. More online orders
4. More reservations
5. Better online reputation
6. Be known as the spot for ___
7. Fill my slow times
8. Grow my catering / private events

**Excluded:** "open another location" and "sell or hand off the business."

## Reasoning

Excluded goals are **business outcomes** Apnosh might support (with brand readiness work, transferability documentation) but isn't the right partner for their core execution (real estate, capital, hiring, M&A).

Including business-outcome goals in the marketing-help catalog overpromises what Apnosh delivers. An owner who picks "open another location" expects help opening a location; we deliver brand prep work. Disappointment follows.

Better: when an owner articulates an excluded goal in conversation, the strategist acknowledges and offers the marketing prep work that supports it ("we'll help build the brand foundation that makes franchise readiness possible") — without structuring it as a sellable goal.

## Alternatives considered

- **10-goal catalog** with the two excluded items kept. Rejected — overpromise risk.
- **6-goal catalog** consolidating reservations into foot traffic, etc. Rejected — collapses meaningfully different signals.
- **Free-form goals** (owner writes their own). Rejected — defeats the purpose of structured playbooks; can't build a matrix against unstructured input.

## Consequences

- The onboarding goal-selection screen shows 8 goals, not 10.
- `service_expectations` and `goal_playbooks` are hand-curated for these 8 only.
- When owners articulate excluded goals, strategist conversation handles the gap.
- If owners repeatedly request a goal we don't have, that's the signal to revisit this decision (catalog can grow, with a new decision log).
