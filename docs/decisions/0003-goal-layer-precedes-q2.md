# 0003 — Goal layer precedes Q2 features

**Date:** 2026-05-08
**Status:** Accepted
**Decided by:** Mark + Claude

## Context

Q1 shipped the foundations + four features (state machine, review fetch, strategist console, service-deliverable spine). Q2 was originally scoped as Meta Ads, Klaviyo, advanced local SEO — a continuation of channel-by-channel feature build.

Mid-spec re-think reframed Apnosh as **goal-led, not channel-led**. Without a goal/playbook/shape layer underneath, every Q2 feature lands as another orphan capability — not part of a coherent product.

## Decision

**Q2 begins with the goal layer install (3–4 weeks), then Q2 features (Meta Ads, Klaviyo, SEO) plug into it.**

Specifically:
- Wk 1: schema migrations for `clients.shape`, `client_goals`, `goals_catalog`, `goal_playbooks`, service goal-tagging
- Wk 2: redesigned onboarding flow capturing shape + goals (the most important UX in the product)
- Wk 3: dashboard reorganizes around active goals; channel pages become goal-contextual surfaces
- Wk 4: strategist console adds goal-progress signal; quarterly goal-review flow stub

Then: Meta Ads, Klaviyo, SEO get built as services that serve specific goals, not as standalone capabilities.

## Reasoning

If we built Klaviyo first, three problems:

1. **Klaviyo would land as "the email tab"** — channel-organized, indistinguishable from every other email-marketing platform.
2. **The strategist would have no framework for prescribing email vs. another lever.** Klaviyo would be sold to clients regardless of fit.
3. **The onboarding wouldn't capture what Klaviyo's playbook needs** (regulars-vs-new ratio, daypart, list size) because there's no shape model yet.

Doing the goal layer first costs ~3–4 weeks. Skipping it costs the entire product's coherence.

## Alternatives considered

- **Keep original Q2 sequence** (Meta → Klaviyo → SEO, goal layer in Q3). Rejected — adds 6+ months of orphan-feature drift.
- **Goal layer in parallel with Q2 features.** Rejected — onboarding redesign in particular needs strategist input and design iteration; can't be split with feature engineering.
- **Skip goal layer entirely, add it later.** Rejected — every existing feature would need redesign once goals exist; cheaper to install the layer now while there are 4 surfaces to update, not 12.

## Consequences

- Q2 ships fewer total features than originally planned (~3 channels + goal layer instead of ~4 channels).
- Q2 features land as part of a coherent goal-driven product, not as orphan capabilities.
- The dashboard, strategist console, and service catalog all rework around active goals during the goal-layer install.
- Onboarding becomes a weeks-long design effort, not a form. Worth it — it's the moat in product form.
- `audits/2026-08-q2-scoping.md` requires revision to reflect goal-led framing.
