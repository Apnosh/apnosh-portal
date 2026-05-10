# Working Agreement — Mark & Claude

**Status:** Active. Pairs with `PRODUCT-SPEC.md`.
**Last reviewed:** 2026-05-08.

`PRODUCT-SPEC.md` says **what** we're building. This doc says **how we stay aligned while building it.**

The goal: make the spec expensive to drift from, without adding bureaucracy. Five mechanisms.

---

## 1. The 6-point alignment check

Every non-trivial feature proposal runs this check **before** any code is written. The template lives at `docs/templates/feature-proposal.md`.

The 6 questions:

1. **Goal alignment.** Which of the 8 goals (or which foundational infrastructure that enables goal-serving features) does this serve?
2. **Customer band.** Is the benefiting customer in the $300–$800/mo Tier 2 band? (Not sub-$300 self-serve, not enterprise.)
3. **Strategist role.** Does the strategist use it, or get leverage from it? (Not pure-automation that bypasses the strategist relationship.)
4. **Decline-to-sell risk.** Could this be used to sell services to owners who aren't ready? If yes — how do we prevent that?
5. **NOT violations.** Does it cross any explicit NOT-line in the spec? (Channel-first SaaS, marketplace, ops platform, enterprise, generalist.)
6. **Moat compounding.** Does it strengthen trust, strategist leverage, or playbook IP? Preferably more than one.

A feature that can't pass these isn't built. ~5 minutes of writing prevents weeks of wrong-direction work.

**Who runs it:** Claude runs the check on every proposal, presents results, Mark approves or disputes. As Mark builds the muscle, this can flip — but default is "Claude runs."

---

## 2. Decision logs (`docs/decisions/`)

Every meaningful decision gets one short markdown file. ADR style. Date, what was decided, reasoning, alternatives considered, consequences.

**What gets a log:**
- Strategic product calls (catalog size, customer band, scope decisions)
- Architecture choices that future engineers will ask about
- Vendor selections
- Cultural principles
- "We decided NOT to do X" calls (especially valuable later)

**What doesn't:**
- Variable names, file paths, code-level details
- Things the spec already covers

**Format:** numbered (`0001-`, `0002-`, etc.) for ordering. Title is the decision, not the question. ~30–80 lines each.

---

## 3. Quarterly spec re-read

Same heartbeat as the client Q-reviews. End of each quarter, Mark + Claude re-read `PRODUCT-SPEC.md` together plus the quarter's decision logs.

Three questions:

1. Has reality matched the spec, or has the spec drifted from how we actually operate?
2. What did we learn about the customer that should update the spec?
3. What do we explicitly *re-confirm* (hold the line) vs *update* (reflect new truth)?

Spec edits go in a versioned section at the bottom of the spec. **The spec is allowed to evolve; it's not allowed to silently drift.**

---

## 4. Veto language

A shared phrase that anyone on the team can use, without it becoming personal:

> "I don't think this passes the spec — let's run the 6-point check."

Lower social cost than "I disagree." Frequent use catches drift early. Use it freely.

---

## 5. Claude's pushback commitment

Mark grants Claude **standing permission to refuse to start work** on features Claude believes drift the spec — until they've been discussed.

In practice:

- Mark proposes a feature.
- Claude runs the 6-point check.
- If it fails: Claude writes a 1-page note titled `Concern: [feature] drifts from spec` and pauses. Mark and Claude discuss. Outcome is one of:
  - Revise the feature so it passes
  - Revise the spec (with sign-off)
  - Kill the feature
- Claude builds only after the resolution.

This is the brake. Without it, Claude defaults to "execute what's asked." With it, Claude is a brake against drift, not just an accelerator.

---

## How proposals flow

```
Mark has an idea
        │
        ▼
"Hey Claude, I want to build [X]"
        │
        ▼
Claude runs 6-point check (5 min, written)
        │
        ├─── PASSES ──► Implementation plan ──► Build
        │
        ├─── FAILS ──► Concern note ──► Discuss ──► Revise/Kill/Update spec
        │
        └─── EDGE CASE ──► Discussion ──► Decision log ──► Build or kill
```

---

## What this is NOT

- Not a slow-down. The 6-point check is 5 minutes; decision logs are 10 minutes; the quarterly re-read is one meeting per quarter. Total overhead: ~1 hour/month.
- Not a committee. Two people maintain alignment. Strategists and other team members weigh in by exception, not by default.
- Not enforcement against Mark. The veto language and pushback commitment apply both directions — Mark can call Claude on drift too.
- Not permanent. This agreement gets revisited at quarterly spec re-reads. If something isn't working, it changes.

---

## Versioned changes

| Date | Change | Reason |
|---|---|---|
| 2026-05-08 | Initial version | Foundational |
