# 0002 — Decline-to-sell cultural principle

**Date:** 2026-05-08
**Status:** Accepted
**Decided by:** Mark + Claude

## Context

The vendor ecosystem around restaurants is famously predatory — sales-driven, channel-pushing, indifferent to whether the customer is ready for what they're buying. Apnosh's positioning rests on being the anti-pattern.

We needed an explicit cultural rule that operationalizes "anti-rip-off" without becoming gatekeeping or refusing-to-engage.

## Decision

The team operates by this principle, written verbatim:

> **"We show every owner what we know about their situation. We don't tell them what to do. We don't refuse to work with them. But we won't sell them services we don't believe will work — we have the conversation, recommend the foundation, and let them choose to build it."**

In practice: when an owner sets a goal that doesn't fit their shape (e.g. "open another location" with $300/mo budget and a 6-month-old single store), the system shows the math ("this typically requires ~$2,500/mo and 18 months at current scale"), declines to sell franchise-readiness services at that stage, and offers the foundation work instead.

The owner still chooses. Apnosh just doesn't take their money for the wrong work.

## Reasoning

This is the trust moat in operating practice. Three components:

1. **Show the math** — informational, transparent, owner agency preserved.
2. **Don't refuse to work with them** — we engage. The conversation continues. Foundation work is offered.
3. **Decline to sell what isn't ready** — we don't take money for services we don't believe will work for this customer at this stage.

Without component 3, the principle is "show the math and sell whatever they ask for" — which is what every other vendor does. Component 3 is the difference.

## Alternatives considered

- **"Show the math and execute whatever they ask"** — preserves revenue but indistinguishable from competitors.
- **"Refuse service if shape-goal mismatch"** — too gatekeeping; loses owner agency and feels paternal.
- **"AI-only flag, human always sells"** — kicks the cultural problem into a tool; doesn't fix the underlying incentive.

## Consequences

- Strategists need to memorize and operationalize this. Onboarding for new strategists includes role-play of the "decline conversation."
- Sales conversations sometimes end with "we can't help you yet, here's what to build first." Some prospects walk away. Acceptable cost.
- The principle is the answer to "why Apnosh" in every external context — sales, marketing copy, founder pitches.
- Forcing this into product surfaces (goal-shape mismatch flags, transparent budget conversations) is a recurring design constraint, not a one-time feature.
