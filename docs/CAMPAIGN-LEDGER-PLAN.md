# The Campaign Ledger — plan of record

**The owner's principle (2026-07-29):** before any campaign is built, the full set of information
it needs must be in hand — first from the account, then from the description, and only then from
questions. Ask nothing we already know. Build nothing while a needed answer is missing. Then the
composed plan matches exactly what was described.

**The waterfall, named:**

- **Tier 1 · KNOWN** — read from the account (business profile, onboarding, connected channels,
  live Google/analytics reads). Never asked.
- **Tier 2 · READ** — extracted from the "Describe your campaign" paragraph when the owner
  already said it. Asked only by listening; corrected via read-back, not re-asked.
- **Tier 3 · ASKED** — the remainder, filtered to what THIS campaign's recipe actually consumes.
- **Tier 4 · DEFAULTED** — anything still open takes a declared default, shown to the owner
  ("we assumed X"), never silently.

The law that makes it honest, borrowed from checkout's vault (law 5): **a question may not be
asked if the answer is already held, and a consumed field may not be silently missing.**

---

## 1. The ledger itself — every fact any campaign can consume

One typed module (`src/lib/campaigns/data/campaign-ledger.ts`) is the single source of truth:
the field, its source of truth, which tier supplies it, and what consumes it. Today this
knowledge is scattered across PlanInputs, MonthlySignals, the describe API's result shape,
gapsFor, and the composer's parameters — which is why nobody can answer "do we have everything?"

| Field | Tier today | Source of truth | Consumed by |
|---|---|---|---|
| Business name, cuisine, neighborhood | KNOWN | business profile | content briefs, "near me" copy |
| Service model (dine-in / delivery-only) | KNOWN (via reach='anywhere' answer today) | profile → should move to Tier 1 | reach exclusions (address-bound work) |
| Google rating + review count | KNOWN | live GBP read (MonthlySignals.rating) | tilt M3: <4.3 boosts review work |
| Google listing health | KNOWN | GBP diagnosis (listingCompleteness) | tilt M4: ≤70 boosts listing fixes |
| Email/text list (have one?) | KNOWN | connections (hasList) | tilt M5: build-vs-send; send-rail holds |
| Website + monthly visitors | KNOWN (system goals only today) | GA service account | brain signal-fit; should join ledger |
| Social / GBP / delivery connections | KNOWN | channels table | connect recommendations, publish rails |
| Menu items + featured dishes | KNOWN | menu_items | promote options, content briefs |
| Current specials | KNOWN (unused by scratch flow) | client_specials | content briefs — Phase 4 |
| What worked / flopped here before | KNOWN | measured outcomes (working/droppedServiceIds) | tilt M2 + proven-loser demotion |
| Complaint themes | KNOWN | review analysis | tilt M6: photo work as repair |
| Known for / stands out / audience / slow days | KNOWN | onboarding | briefs; audience → Phase 4 tilt |
| Situation + goal + shape | READ | describe (AI read; matchSituation floor) | everything |
| Date / run window | READ, else ASKED | describe → date question | schedule (works backwards) |
| Start (asap / date) | ASKED (new) | start question | brief.start, schedule |
| Assets the owner brings | READ, else ASKED | describe → assets question | never-billed coverage + ranking boost |
| What to promote | ASKED (menu prefills) | promote question | content briefs |
| Reach radius | ASKED (default local) | reach question | address-bound exclusions |
| Slow shifts | READ (situation), else ASKED | shift question | night work layered on goal |
| Avoid list | ASKED | avoid question | service exclusions + tone constraints |
| Budget | ASKED (optional, last) | money question | plan size (incl. dated launch mode) |
| Free-text notes | ASKED (optional) | notes box | reaches the team verbatim |
| **Offer terms** (discount / deal structure) | READ else ASKED · only when the campaign includes an offer · **never defaults** | describe → offer question | not yet consumed (Phase 4: offer briefs + redemption tracking) |
| **Offer redemption limit** | READ else ASKED · offer-shaped only · **never defaults** | describe → offer question | not yet consumed (Phase 4) |
| **Offer expiration** | READ else ASKED · offer-shaped only · **never defaults** | describe → offer question | not yet consumed (Phase 4) |
| **Success target** | ASKED · suggested from comparable past campaigns, owner confirms rather than invents | target question | reporting + mid-run pivot flag (planned). A number on the proxy metric this recipe already tracks — never "incremental revenue" |
| **Capacity check** | ASKED · only when the shape creates a demand spike (offer-driven, event-anchored, or time-boxed) | capacity question | staffing/prep/quantity limits + who briefs staff, into the work brief. The RESTAURANT's capacity to absorb demand — separate from creator routing capacity |

Phase 1 turns this table into code: `ledgerFor(situation, account, read, answers)` returns every
field with `{ value, tier: 'known'|'read'|'asked'|'defaulted'|'missing', consumedBy }`. The
completeness question becomes checkable, and the sim can prove the law.

## 2. Phase plan

**Phase 1 — the ledger module (pure, 1 session).**
Unify PlanInputs + MonthlySignals + the describe result + Answers into `ledgerFor()`. No behavior
change; the walk and composer read through it. Sim: every field a composer/brief consumes appears
in the ledger; every question maps to a ledger field. (This also finally gives the "what we
already know" disclosure and the plan screen one shared source.)

**Phase 2 — widen the describe read (1 session, needs prod AI credits).**
The describe API today extracts: situation, shape, when, until, assets, summary, unsupported,
ask[]. Widen the extraction schema to also pull, when the owner said it: budget ("we have about
$2k"), promote subject ("our new brunch menu"), audience ("families"), reach ("the whole city"),
shift ("Tuesdays"), avoid ("no discounts"), start ("as soon as possible"). Each confident
extraction pre-fills its ledger field and REMOVES that question from the walk; the read-back
line says what was taken ("Got the $2,000 budget and the brunch focus from what you wrote").
Guardrails: per-field evidence quote required; low confidence → still ask; **budget is always
read back for confirmation before it sizes anything** (money never moves on a guess). The local
matchSituation floor stays the no-AI fallback, extracting nothing beyond the situation.

**Phase 3 — need-driven asking, sim-locked (1 session).**
Each situation already declares `needs`; the model's ask[] already prunes per-brief. Formalize:
`requirementsFor(situation)` = the ledger fields this campaign's composer + briefs actually
consume. The walk asks exactly `requirements − known − read`, in a stable order, and the sim
pins both directions: nothing asked that isn't consumed (no theater), nothing consumed that
isn't known/read/asked/defaulted (no silent holes). Tier-4 defaults render on the plan ("we
assumed local reach") with one-tap change. The conditional questions obey the same law:
offer economics only when the campaign includes an offer; the capacity check only when the
shape creates a demand spike (offer-driven, event-anchored, or time-boxed) — an awareness-only
campaign must never see it. The success target is asked WITH a suggested number from comparable
past campaigns, so the owner confirms rather than invents.

**Phase 4 — the composer consumes the whole ledger (1–2 sessions).**
Close the dead-input gaps found in the audit: audience genuinely tilts the ranking (late-night →
social-weighted; older regulars → Google-weighted — bounded rules next to M1-M6, sim-pinned like
signalNotes); specials + featured dishes flow into the content briefs the workers receive; GA
visitors join MonthlySignals for the scratch flow. Acceptance goldens per situation: change any
consumed ledger field → the plan or its briefs change (no dead inputs); remove a known field →
the matching question appears (the waterfall works).

**Phase 5 — the session says the tiers out loud (small).**
The intro line becomes an honest account of the waterfall: "Your account gave us your menu,
rating and listing health. From what you wrote we took the date and the DJ. Two questions left."
The count is computed from the ledger, so it can never overpromise.

## 3. Decisions — RESOLVED (owner, 2026-07-29)

1. **Tier 2 reads:** prefill everything with the read-back correction line; **budget always gets
   an explicit confirm tap** before it sizes anything.
2. **Tier 4 defaults:** stay exactly as-is — reach = local, start = ASAP. **No new defaults.**
   Offer economics (terms, redemption limit, expiration) may NEVER default.

## 3b. Reorder — the pilot gate

After Phase 3 ships, **pause**: put the flow in front of the two test clients on a real
campaign. Measure question count, completion rate, and where they stall. **Phase 4 proceeds
only after that review.** Phase 5 may ship alongside Phases 1–3 (it is small).

## 4. What this is NOT

Not a new brain: the composer, ladders, tilt rules, gates and vault stay. This is the intake
contract that guarantees the composer is always fed everything it can use — which is what makes
"the perfect campaign for exactly what was described" a checkable claim instead of a slogan.

Status: Phases 1-2 of 5 complete.

- **Phase 1 SHIPPED** (2026-07-29, 3cf592f): campaign-ledger.ts (`ledgerFor` + tiers + owner
  rules encoded), readKeys provenance, amendment fields on Answers + brief, sim (96 checks).
- **Phase 2 SHIPPED** (2026-07-30): the wide describe read. The route extracts budget, reach,
  shift, avoid, audience, promote, start and the offer fields, each behind the evidence law
  (`sanitizeRead` in plan-goals: quote must appear verbatim in the owner's text, values must
  survive our own vocabularies — both sim-locked, 120 checks total). The walk drops read
  questions; every take renders as a chip under the recap with tap-to-reopen (the reopened
  question arrives with the read answer preselected); budget prefills the money screen but
  always gets its explicit confirm tap ("nothing is sized until you do"). Live-verified: a
  grand-opening paragraph answered 8 fields and left a 1-question walk.

Next: Phase 3 (need-driven asking, conditional offer/capacity questions, success target with
suggested number), then the PILOT GATE with the two test clients before Phase 4.
