# Graphic Design Ordering — plan of record

Owner spec, 2026-07-31. A standalone, chargeable configurator: plain-language choices, price
and production spec assemble live. First real workout for the ledger/describe-read machinery
on a single service.

**Build rule: reuse, don't parallel.** Built from the campaign builder's own components — the
describe-read (Phase 2 extraction rules), the ledger laws, the why-cited line items, the asset
library. Anything that would need a second implementation gets flagged, not built.

## The laws (inherited)
1. Never ask what is already held (account, asset library, design history, cited read).
2. Nothing consumed is silently missing — open facts take a declared, shown default.
3. Every price line cites the answer that created it. No un-explained money.
4. Budget-adjacent facts (price, print quantity, rush) are explicitly confirmed, never
   inferred-and-charged.
5. Exact copy is confirmed pre-submit, with the revision rule stated at that moment.

## The flow (Phase B)
Step 0 reorder shortcut (history-gated) · Step 1 describe + job chips (same describe-read,
same guardrails, local matcher floor) · Step 2 destinations in destination language, spec
derived silently, print reveals exactly quantity + who-prints · Step 3 copy confirm with the
revision line at the field · Step 4 asset library + quality gate + honest photo add-on ·
Step 5 date with rush window + un-rush nudge · Step 6 one-paragraph read-back, revision
policy, pay/add-to-plan → the confirmed order IS the designer's brief.

## Pricing
Tier never asked (history-derived; ambiguous → LOWER tier + internal review flag). Price =
tier base + 1:1 add-ons (per-destination, photo sourcing, print management + pass-through,
rush multiplier). Live panel, every line cited, unchecking removes its line. Amounts from the
rate-card config, set by the designer job-history review — placeholders never reach clients.

## Status
- **Phase A SHIPPED** (2026-07-31): `src/lib/design/` — destinations.ts (8-destination lookup
  table: dimensions, color mode, resolution, bleed, safe zones, buffer days), rate-card.ts
  (config with `approved: false` gate — Phase B must refuse to render client prices until the
  reviewed numbers land), design-pricing.ts (pure engine: cited lines, needs[] instead of
  guessed print charges, rush = window AND confirmation, ambiguous tier prices low + flags,
  DesignFact why-structure {value, source, citedWords}). Goldens in
  scripts/sim/design-pricing.ts (39 checks: table completeness, no unexplained money, flip
  test, rush honesty, print honesty, tier rule, placeholder gate).
- **Phase B BUILT, testable at /preview/design/order** (2026-07-31): reuse flag 2 resolved by
  extraction — the evidence gate moved to src/lib/campaigns/data/read-evidence.ts (campaign
  sims prove behavior identical), design got its own vocabulary in design-read.ts + a
  /api/design/describe route on the campaign route's skeleton (adds futureDate: a model-guessed
  past year rolls forward, applied to BOTH routes). Six-step flow in
  src/components/design/design-order-flow.tsx: describe+chips (chips are the no-AI floor),
  destinations w/ print follow-ups, exact copy w/ revision line, photos w/ quality gate
  (fixtures; real library still flag 1), WalkCalendar w/ rush classifier + un-rush nudge,
  review+submit. Price panel pinned + cited; photos became OPTIONAL in the engine (unanswered =
  needs entry, never a charge). Goldens now 55. Preview submit records locally; order
  persistence + payment are post-testing wiring.
  STILL GATED FOR CLIENTS ON: rate card populated from the designer job-history review
  (last 15-20 jobs: tier tags + hours + revision counts) → flip RATE_CARD.approved.
  The review now fills PER-DESTINATION adders (destinationAdder: one number per destination,
  11 total — a banner adaptation is not a Facebook post). Engine rule: the most expensive
  picked destination is included with the design (visible $0 line), the rest bill their own
  adder, ranked so tap order can never change the total.
- **Phase C**: reorder shortcut + tier detection from design history (layout-family tag);
  until then the flow fixes tier 2 (custom).

## Reuse flags (raised per the build rule, 2026-07-31)
1. **Photo library with upload + quality gate does not exist yet.** The campaign walk treats
   owner photos as a declared chip; nothing stores client images or grades them. Step 4 needs
   a real asset store + gate — that is NEW infrastructure, not a reuse, and needs its own
   decision (scope, storage, what the gate checks) before Phase B.
2. **The describe-read route is campaign-shaped.** The evidence-law machinery (quote-backed
   fields, credibleDate, vocabulary filtering, local matcher floor) is reusable, but it lives
   inside the campaign route with campaign vocabulary. Phase B should extract the generic
   helpers (backed-field check, the sanitize pattern) into a shared module and give design its
   own vocabulary — parameterization, not a second implementation. Flagged so the extraction
   is a deliberate step, not an accidental fork.

Out of scope (owner): subscription bundling beyond add-to-plan, automated design generation,
any second implementation of describe-read / asset storage / why-lines.
