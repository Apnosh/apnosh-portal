# The strategist flow — plan of record (v2, 2026-07-28)

The end-to-end: describe or pick → intake → the best possible plan, tool-agnostic → adjust →
route each move to who does it → timeline + what it takes → billing → shipped. v1 reviewed
externally; v2 folds in four additions (allocation record, vault gate, strategist gates/priors,
worked-example goldens + loud AI failure). Deltas from v1 are marked **[v2]**.

## The architecture: two layers, one flow

**THE INVERSION (owner sign-off required before build):** the plan is composed as strategy first,
tool-agnostic, and only then routed to who does it. Today's composer does the opposite (A2 gates
composition on availability). Under the inversion, availability shapes ROUTING, never the plan.

```
DESCRIBE / PICK → INTAKE → THE PLAN → ADJUST → HOW IT'S DONE → TIMELINE + WHAT IT TAKES → BILLING → SHIPPED
   (exists)      (exists)  (upgrade)  (exists)  (NEW: router)        (exists)             (branch)   (exists)
```

- **Layer 1, The Plan**: marketing moves in the atomic catalog's vocabulary (31 atoms). Includes
  moves we cannot service (`serviceable: false`).
- **Layer 2, The Routing**: per move, the lanes `DIY · AI guide · Apnosh · Creator`, filtered by
  the platform law (`laneViolations`), the availability allowlist, and real creator supply
  (crafts match). The 4-value `producer` field already in the schema carries the choice.

## The laws (also in CLAUDE.md; every one sim-enforced)

1. **The platform law.** A lane may not promise what the platform cannot do.
2. **The orphan rule.** A genuinely useful move may never be silently dropped because we cannot
   sell it. It ships as DIY or AI guide.
3. **No orphan without a guide.** `serviceable: false` is only legal when a real guide body exists
   behind it. A flag without content renders an empty state, which is worse than omission. **[v2]**
4. **Record the allocation at mint.** The composed plan, the routing decisions, the prices, the
   signals the strategist saw, and an outcome stub are persisted when a campaign mints. The first
   cohort is the only training set that will ever exist; skipping this is unrecoverable. **[v2]**
5. **Vault writes are an acceptance criterion, not cleanup.** If campaign #2 re-asks what
   campaign #1 collected, collect-once is broken on day one. **[v2]**
6. **AI failure is loud and graceful.** Every strategist surface has a stated degraded mode (the
   describe screen's `matchSituation` floor is the pattern) and key/credit failure raises an admin
   alert. A blank screen from an empty API key is prohibited. **[v2]**
7. **Cite your source.** Plan numbers carry their data maturity ("our estimate" until n ≥ 5, then
   "verified median") — the tool doc's own statistics rule, applied to the strategist. **[v2]**

## Phase 0 — production rails (owner + assistant, parallel)

1. Top up the Anthropic balance (54 surfaces silently down).
2. **[v2]** AI health: a probe endpoint + loud degradation. Generalize the `matchSituation`
   fallback pattern; admin alert on auth/credit failure. Permanent fix, not a topped-up key.
3. Merge `feat/campaign-checkout` (keys, migration 215 via Dashboard, G1 double-billing decision).
4. Price `delivery-opt` + pending pricing rows.
5. **[v2]** Migration for the allocation record (jsonb on campaigns or its own table) + an AI call
   log (strategist calls + outputs verbatim; owner edits to AI proposals are the disagreement log).
   Handed over as Dashboard SQL like every migration.

**Owner decisions due before session 1:** G1 double-billing · pending prices · inversion sign-off.

## Phase 1 — the strategist (2-3 sessions)

- Finish the one-brain consolidation (steps 1-2 done; Brain 2 is the base).
- **Widen the pipe**: the ~40 held signals (vault, GBP diagnosis, review themes, prior campaign
  outcomes, business type) vs the 6 reaching the planner. The single biggest quality lever —
  a data-plumbing problem before it is a prompting problem.
- **[v2] Plan-level gates as data**: lead-time (generalizing `deriveSchedule.tooSoon` to the
  strategist level), capacity-vs-target, reputation floor, budget floor. Pure functions + tables,
  sim-tested. A gate that fires does NOT compose a doomed plan; it says what fits instead and
  offers the message thread to talk it through. (Adapted from the review's "concierge branch" —
  our escalation surface is the existing owner↔team thread.)
- **[v2] Split priors as data**: budget allocation across stages by business archetype, with
  concentration floors, carrying the cite-your-source string.
- Guide-only moves (`serviceable: false`) under law 3: each orphan move ships with its guide.
- Entry: the describe box + AI-chosen follow-ups (built); popular ones = store cards.
- Plan review: "the Walk" 3-act screen (designed); adjust/swap APIs (built).
- **[v2]** Log every strategist call verbatim from day one (Phase 0's table).

### Progress (2026-07-28)

- **1a SHIPPED** (S1-S6): brain-routing golden 63 · dead Brain-1 deleted · migrations 230/231
  applied · AI call log with loud failure + dedupe (400-credit body classified) · pipe widened
  6→12 MixSignals · compose-time allocation snapshot (signals_at provenance) · old/new prompt
  A/B run live, owner-approved.
- **1b SHIPPED** (A: plan gates refuse-not-apologize, fire pre-compose, boundary-pinned sim 31 ·
  B: stage-spend rollup + split priors with "Our estimate." cite, sim 132 · C: guide-only rail
  serviceable:false, 6 guide moves, mint predicate extracted + negative-proven, migration 232,
  sim 53). Lesson worth keeping: BOTH the guide map and the priors floors shipped keyed by card
  ids while their call sites passed goalKey — silently zero everywhere until the sim's emission
  check caught it. Both sims now pin map keys to isSystemGoal.
- **1c SHIPPED** (2026-07-28, 3 commits): FreeActions deleted, mechanisms carry FreeRefs
  resolved through GUIDE_MOVES (7 new moves authored; one content source) · composeMonthlyPlan
  joined the one brain: MonthlySignals (proven losers/winners, rating, listing health, list,
  complaints) steer ranking BELOW leverage, safe route structural (thin data → no signals
  object → deep-equal to the pre-signals engine, sim golden), all three dial anchors thread the
  same signals · the monthly draft carries ≤5 guide-only owner moves (Record<MonthlyStepKey>
  is the compile-time vocabulary pin). The e2e caught a real ship-stopper: supabase batch
  inserts null-fill non-uniform keys, so one guide row made serviceable=null on every neighbor
  row → lineItemToRow now writes serviceable/guide_key explicitly on every row. Task #194 (the
  two planning brains) closed: one signal source, one guide content source.
- **Phase 2 NEXT**: the router (routing.ts, hands-on question, per-move lane adjust).

### Phase 2 progress (2026-07-28)

- **SHIPPED** (4 commits): builder/routing.ts — per composed line, all four lanes (Lane ≡
  PieceProducer, SetupLaneKind ⊂ Lane compile-pinned) with honest availability (team=rail law;
  diy=law 3 via law-clean setup-card lanes or the guide rail; ai=card/manifest; creator=content
  pieces only, the one shape with a mint path — sim-pinned out for services), existing prices
  only (creator = same-price swap, said so), and a hands-on-biased default. routeViolations =
  laws 1+2 as arithmetic (the laneViolations pattern), with one narrow honest exception: a
  rail-held line legally has zero lanes because held-and-unbilled IS its law-2 surface (the
  landing-less list — the send five — is pinned and may only shrink). stampLane is the one
  producer/price/ownerMode encoder. creatorSupplySummary rides the plan-mix response (copy +
  default bias only, never availability). Hands-on control on the order summary; LaneRow inline
  in expanded service nodes (browser verification caught the ServiceSheet being unreachable) +
  the LineCard drawer (guided diy replaces the freeform escape where a card exists).
  /preview/campaign/lanes = the real flow on fixtures, no login. lane-routing sim 100 checks
  incl. mutated-card + doctored-route + held-abuse proofs. Verified live: hands-on and You taps
  move the bill exactly as stamped.
- Deferred (unchanged): creator on service lines (needs service→craft + dispatch bridge) ·
  collapsing the gbp jsx doer slot · ServicePicker→LaneOffer convergence.

## Phase 2 — the router (2-3 sessions)

- `routing.ts`, pure, sim-proven: per move → available lanes + a default. Inputs: platform law,
  availability, creator crafts, per-lane price, budget, and the hands-on question (asked at
  "how it's done", three options).
- Owner adjusts per line: remove / drop to DIY to save / upgrade to a creator.
- Sim enforces laws 1 and 2 against mutated implementations (the guard must be proven to fail).

## Phase 3 — commitment (1-2 sessions, assembly)

- Order summary by billing rail → dated timeline from the turnaround critical path (numbers
  pending owner) → "what we will need from you" via `intakeFor` minus the vault → payment → ship.
- **[v2] Acceptance criteria for shipping this phase:**
  - The allocation record writes at mint (law 4), including the pre-edit AI proposal and the
    owner's final version.
  - Connect flows and mark-done actions call `satisfyRequirement` (law 5) — the vault genuinely
    fills, so campaign #2 asks less than campaign #1.
- Ship mints work orders + creator bookings (bridges exist); readiness rail takes over.

## Phase 4 — prove it, continuously

- Headless sim drives describe→checkout→mint end to end.
- **[v2] Worked-example goldens, asserting plan SHAPE, not strings:**
  - A high-budget grand opening: production moves scheduled before amplification moves; total
    within budget; every unserviceable move carries a guide; availability honesty holds.
  - A 3-week-lead persona: the lead-time gate fires; no doomed plan composes; the alternative +
    talk-to-us path renders.
  - A cold-start persona (no signals): the plan says "our estimate" everywhere it must (law 7).
- AI-down run: every surface degrades per law 6, and the sim proves it by running with the key
  withheld.

## Deliberately not adopted from the review

- **Fee as its own line + 4-6% contingency**: our pricing carries margin inside service prices
  (margin-floor checks in the catalog). Splitting fee/contingency out is a pricing-model change —
  an owner decision, parked, not silently adopted.
- **"Concierge branch"** as a distinct product: adapted to the existing owner↔team message thread.
- Model/effort choices per phase: session configuration, not plan content. Practice stands: plan
  mode at each phase start, phases stay session-sized.

## Build order

Phase 0 rails first (owner actions unblock everything). Then **Phase 1 before Phase 2** — the
widened pipe is the quality lever, and the router is better built once the strategist it routes
for is real. Phase 4's sim grows alongside each phase, not after.
