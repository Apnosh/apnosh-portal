# 0005 — Validate before goal layer build

**Date:** 2026-05-08
**Status:** Accepted
**Decided by:** Mark + Claude

## Context

Q1 work (11 weeks of code) is complete and pushed to main but **not deployed**. The goal-led product reframe happened *after* most of Q1 was written. The next planned build is the 4-week goal layer install.

Question: build the goal layer now, or pause to validate the spec assumptions first?

## Decision

**Pause new feature work for ~10 days. Validate four assumptions cheaply. Then build with confidence.**

The four validations:

1. **Tenancy backfill (mig 090) doesn't break production** — apply Q1 migrations to staging, pressure-test the Tier 1 backfill on real data.
2. **The 8-goal catalog matches how owners actually talk** — 3–5 unstructured conversations with restaurant owners (not customers).
3. **Strategists will actually use `/admin/console`** — Mark uses it daily for 3–5 days; one strategist 30-min walk-through.
4. **The product spec matches Mark's operating instinct + strategist reality** — strategist alignment session.

Toast partner enrollment also gets submitted this week (unrelated to goal layer; just a 6–8 week timeline that can't slip further).

## Reasoning

The expensive risks are cheap to validate. Building on unvalidated assumptions risks 4 weeks of wrong work; validating costs ~5–6 hours of Mark's time over 10 days.

Specifically:
- **Goal layer built on validated catalog → 4 weeks of right work.**
- **Goal layer built on unvalidated catalog → potentially 4 weeks of work + 4 weeks of revision after first owner conversation.** Doubling cost to "save" 10 days.

The strategist console is live but unused by its primary user. Building more on top of an unverified leverage feature compounds risk.

## Alternatives considered

- **Continue building goal layer immediately.** Rejected — see reasoning. Builder bias should be checked when validation has higher leverage.
- **Validate everything before deploying any code.** Rejected — the Q1 code is largely additive infrastructure that survives the reframe. No need to gate deployment on goal-layer validation.
- **Validate only one thing (e.g. owner conversations).** Rejected — the four risks are different in kind; the cheapest check on each takes hours, not weeks.

## Consequences

- ~10 days no new feature commits. Existing Q1 work gets deployed and used.
- Mark's calendar adds: Toast enrollment (30 min), staging deploy oversight (half day), 5 days of console use (5 min/day), strategist session (30 min), 3–5 owner conversations (~2.5 hr).
- Claude's deliverables: Q1-to-goal-layer reconciliation memo, strategist session brief, owner conversation guide. (All this commit.)
- Goal layer build starts only after validation, with possible spec adjustments based on signal.

## Pre-commitment

If validation surfaces material problems (catalog needs revision, strategist won't use the console, owners describe different goals), the spec gets revised before the goal layer build. **No "we already wrote the spec, let's build to it anyway."** The whole point of validating is to update on signal.
