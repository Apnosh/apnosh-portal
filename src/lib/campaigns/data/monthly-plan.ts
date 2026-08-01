/**
 * monthly-plan — one marketing plan for the whole business, fitted to a monthly budget.
 *
 * WHY THIS EXISTS RATHER THAN A SIXTH ENGINE. The portal already has the two hard parts:
 *   - plan-engine.ts knows how to FIT to a budget (foundations first, then growth by leverage, with
 *     one-time costs amortised to a monthly equivalent so a single dial governs the whole plan), and
 *     it already knows how to discount what the owner already has (HAS_MAP).
 *   - the catalog knows WHICH services matter, via the goalPlays every service carries.
 * What was missing is only that plan-engine is keyed per goal, and a monthly marketing plan is not
 * about one goal. So this module does one new thing: it MERGES the four goal candidate sets into a
 * single whole-funnel ranking, and hands the packing back to the same amortised-load rule.
 *
 * THE LEVERAGE RANKING IS DERIVED, NOT AUTHORED. A service that appears in three of the four goals'
 * candidate lists is doing more jobs than one that appears in a single list, so leverage is simply
 * "how many goals want this", tie-broken by its best priority. Nobody hand-ranks 57 services, and
 * when the catalog's tagging changes the ranking follows it.
 *
 * KNOWN STALENESS, SURFACED NOT SWALLOWED. plan-engine's lists name `second-visit` and `offer-eng`,
 * which are not in the generated catalog. serviceById returns undefined for them and planForBudget
 * silently skips them today, which quietly drops what its own ranking calls the highest-leverage
 * play. This module reports them instead (see `missing` on the result) so the gap is visible.
 *
 * CLIENT-SAFE: pure data + resolvers, no server imports.
 */

import { GENERATED_CATALOG } from './catalog.generated'
import type { PricedService } from './priced-catalog'
import { heldServices, isServiceReady } from './service-availability'
import { PLAN_GOALS, candidatesForGoal, shiftCandidates, assetsBoost, type Candidate } from './plan-goals'
import { SEND_DEPS } from '../builder/build-from-atoms'
import { etaLabelFor } from './service-turnaround'
import { passthroughMonthlyMinimumCents, plainCostNote } from '../builder/item-prices'
import { signalTilt, tiltWhys, type MonthlySignals } from './monthly-signals'
import { guideMovesForMonthly } from './guide-moves'
import { WHY_LINES as WHY, fill } from './walk-copy'

/* ── the four steps a stranger moves through ────────────────────────────────────────────── */

export const MONTHLY_STEPS = [
  {
    stage: 'found',
    n: 1,
    name: 'Get found',
    does: 'Someone in your neighbourhood is deciding where to eat tonight and has never heard of you. This is everything that puts you in front of them.',
    col: '#5FA8D3',
    gives: 'Gives the next step people who now know you exist.',
    breaks: 'Nothing here means nobody new finds you. The rest of the plan only works on people who already know you.',
  },
  {
    stage: 'reason',
    n: 2,
    name: 'Give them a reason',
    does: 'They found you. Now they are deciding whether you are worth it: the photos, the menu, what other people said.',
    col: '#7B77D6',
    gives: 'Gives the next step people who actually want to come.',
    breaks: 'Nothing here means they find you and keep scrolling. You are paying to be seen and then losing them.',
  },
  {
    stage: 'easy',
    n: 3,
    name: 'Make it easy',
    does: 'They want to come. This is taking everything out of the way: the hours, the menu, the booking, the order button.',
    col: '#C86FBF',
    gives: 'Gives the next step people who actually turned up.',
    breaks: 'Nothing here means they want to come and cannot work out how. This is the cheapest step to fix and the most expensive to skip.',
  },
  {
    stage: 'back',
    n: 4,
    name: 'Bring them back',
    does: 'They came once. This is what turns that into a second visit, and a third.',
    col: '#34C08E',
    gives: '',
    breaks: 'Nothing here means every month starts from zero. You buy the same strangers twice.',
  },
] as const

export type MonthlyStepKey = (typeof MONTHLY_STEPS)[number]['stage']

/**
 * Which step each service serves.
 *
 * The catalog's `section` is a good default but is not the funnel: `foundation` holds both
 * gbp-setup (being found) and crm-list (bringing people back), so section alone would file a guest
 * list under getting discovered. The default handles the clean majority; the override names the
 * services where section and funnel genuinely disagree.
 */
const STEP_BY_SECTION: Record<string, MonthlyStepKey> = {
  foundation: 'found',
  awareness: 'found',
  capture: 'easy',
  convert: 'reason',
  anticipation: 'reason',
  nurture: 'back',
  retain: 'back',
  advocate: 'back',
  winback: 'back',
}

const STEP_OVERRIDE: Record<string, MonthlyStepKey> = {
  // 'foundation', but these are what a decided customer runs into, not how they find you
  'site-menu': 'easy',
  'ordering-setup': 'easy',
  'google-food-order': 'easy',
  'website-care': 'easy',
  // 'foundation', but these are the list and the rails that bring someone back
  'crm-list': 'back',
  'email-found': 'back',
  'sms-found': 'back',
  // 'foundation', but photos are why someone decides you are worth it
  'photo-library': 'reason',
  'menu-photo-refresh': 'reason',
  'brand-kit': 'reason',
  // 'retain'/'advocate' by section, but reviews are what a stranger reads BEFORE deciding
  'review-responses': 'reason',
  'review-engine': 'reason',
  'review-claim': 'reason',
}

/** Services that never touch a stranger. Real work, but not a rung of the funnel, so they are
 *  reported separately rather than filed under a step they do not actually serve. */
const BACKSTAGE = new Set(['tracking', 'reporting', 'channel-connect', 'listings-sync'])

export function stepOf(id: string): MonthlyStepKey | 'backstage' {
  if (BACKSTAGE.has(id)) return 'backstage'
  if (STEP_OVERRIDE[id]) return STEP_OVERRIDE[id]
  const s = (GENERATED_CATALOG as PricedService[]).find((x) => x.id === id)
  return (s && STEP_BY_SECTION[s.section]) || 'found'
}

/* ── the merged whole-funnel ranking ────────────────────────────────────────────────────── */

/**
 * Candidate sets now come from plan-goals.ts, which reads them off the catalog's own goalPlays.
 * The array that used to live here was a copy of plan-engine's lists: half the width of the real
 * catalog tagging, and it named two services (`second-visit`, `offer-eng`) that do not exist.
 */
const GOAL_CANDIDATES = (): Record<string, Candidate[]> =>
  Object.fromEntries(PLAN_GOALS.filter((g) => g.state === 'ready').map((g) => [g.key, candidatesForGoal(g.key)]))

export interface Ranked {
  id: string
  foundation: boolean
  /** how many of the four goals want this service: the leverage signal */
  wanted: number
  /** best (lowest) priority across the goals that want it */
  best: number
}

/**
 * The merged whole-funnel ranking. Foundations first, then growth by leverage.
 *
 * `goals` narrows which lists get merged, which is what makes picking goals mean something. With
 * none given it merges all four, which is the right default for "just make my month good". Given
 * two or three, a service wanted by all of THEM outranks one wanted by all four in general — so an
 * owner who says "regulars and reviews" gets review-engine and review-responses pulled up rather
 * than the services that merely appear everywhere.
 */
export function rankedCandidates(goals?: readonly string[], shift = false, assets?: readonly string[], signals?: MonthlySignals): Ranked[] {
  const all = GOAL_CANDIDATES()
  const acc = new Map<string, Ranked>()
  let lists = goals?.length ? goals.map((g) => all[g]).filter(Boolean) : Object.values(all)
  /* A goal key we do not recognise must never yield a BLANK plan. Stored goals predate this list
   * (onboarding wrote 'new-customers' and 'slow-nights' for months), and a stale key silently
   * composing nothing is the worst possible failure: the screen looks like it works and quietly
   * offers an empty plan. Unknown keys fall back to the whole funnel. */
  if (!lists.length) lists = Object.values(all)
  /* A named slow stretch is a WHEN, not a goal: it adds the night work on top of whatever outcome
   * was picked rather than standing in for one. */
  if (shift) lists.push(shiftCandidates())
  for (const list of lists) {
    for (const c of list) {
      const cur = acc.get(c.id) ?? { id: c.id, foundation: false, wanted: 0, best: 99 }
      cur.wanted += 1
      cur.foundation = cur.foundation || c.kind === 'foundation'
      if (c.priority != null) cur.best = Math.min(cur.best, c.priority)
      acc.set(c.id, cur)
    }
  }
  /*
   * What the owner brings moves work UP the ranking, never into the plan by force. A DJ makes the
   * event package something to promote; two hundred tickets make offer design worth paying for. It
   * is a tiebreak, not an override, so an asset can never push a service past the coverage rule or
   * past the budget.
   */
  const boosted = new Set(assetsBoost(assets))
  /*
   * THE BRAIN'S TILT (monthly-signals.ts), in strict rank order below the structural terms:
   *   - notDropped sits AFTER foundation, BEFORE wanted: a proven loser falls to last among its
   *     peers, but a dropped foundation still outranks growth — history reorders, it never
   *     reshapes the funnel, so more history can never mean less plan.
   *   - the boost/demote tilt sits BELOW wanted and BELOW assets: what the owner explicitly told
   *     us beats what we inferred, and leverage beats both. Signals reorder ties only.
   * The tilt is budget-blind by construction (one fixed answer per signals object), which is what
   * keeps the ranking identical at every dial position. With signals undefined every new term
   * compares 0 and this sort is byte-identical to the pre-signals chain (sim golden).
   */
  const tilt = signalTilt(signals)
  return [...acc.values()].sort(
    (a, b) =>
      Number(b.foundation) - Number(a.foundation) ||
      Number(tilt.dropped.has(a.id)) - Number(tilt.dropped.has(b.id)) ||
      b.wanted - a.wanted ||
      Number(boosted.has(b.id)) - Number(boosted.has(a.id)) ||
      (Number(tilt.boost.has(b.id)) - Number(tilt.demote.has(b.id))) - (Number(tilt.boost.has(a.id)) - Number(tilt.demote.has(a.id))) ||
      a.best - b.best ||
      a.id.localeCompare(b.id),
  )
}

/* ── the plan ───────────────────────────────────────────────────────────────────────────── */

/*
 * TWO NUMBERS, NOT ONE. Setup work and ongoing work are different promises and are billed at
 * different times, so this module never blends them into a single figure.
 *
 * It used to. One-time costs were amortised over twelve months so that a single monthly dial could
 * govern the whole plan — which is the rule plan-engine uses, and it reads as reasonable right up
 * until an owner sees the invoice. Answering "$300 a month" produced a $3,035 bill on day one and
 * nothing recurring at all, because a $3,035 setup only "loads" $253 a month against the dial. The
 * dial said a month and meant it; the bill did not.
 *
 * So: the dial governs ONGOING work only, one-time work is quoted as its own number, and both are
 * shown before the owner touches anything. Setup costs what it costs — you cannot half-build a
 * Google profile — so the honest move is to say the figure out loud, not to hide it in an average.
 */

/** What this service adds to the monthly bill. One-time work adds nothing — it is quoted to start. */
export function recurringOf(s: PricedService): number {
  const p = s.prices?.[0]
  return p && p.kind === 'monthly' ? p.amount : 0
}

/** What this service adds to the first bill. Ongoing work adds nothing here. */
export function startOf(s: PricedService): number {
  const p = s.prices?.[0]
  return p && p.kind !== 'monthly' ? p.amount : 0
}

export interface MonthlyLine {
  id: string
  name: string
  desc: string
  role: string
  stage: MonthlyStepKey | 'backstage'
  amount: number
  kind: string
  unit?: string
  held: string | null
  /** already handled by the owner: shown, never billed */
  have?: boolean
  /** added by hand, beyond what the budget reached */
  extra?: boolean
  /**
   * WHY THIS LINE IS IN THE PLAN, citing the fact that put it there (the why-layer,
   * 2026-07-31): a signal, an asset, a slow shift, the owner's own hand — or, honestly, the
   * recipe and the budget. Optional so every existing path is untouched; the draft mapping
   * falls back to the catalog role.
   */
  why?: string
}

export interface MonthlyPlan {
  lines: MonthlyLine[]
  /** the first service the budget could NOT reach, and what it would take */
  nextUp: { name: string; addlMonthly: number } | null
  /** candidate ids plan-engine names that the catalog no longer has */
  missing: string[]
  /** the two numbers, so no screen ever has to derive them and risk deriving them differently */
  quote: MonthlyQuote
}

/**
 * The two numbers an owner is actually agreeing to. They are separate because they are separate
 * promises: `start` is work we do once and bill once, `monthly` keeps running until they stop it.
 * Blending them into one figure is what let a "$300 a month" answer produce a $3,035 first bill.
 */
export interface MonthlyQuote {
  /** the first bill: setup this plan needs before anything can run */
  start: number
  /** every month after that */
  monthly: number
  /** nothing keeps running at this number — the honest floor was not cleared */
  nothingRecurs: boolean
  /**
   * MONEY THAT IS NOT OURS. Ad spend goes from the owner's card to Meta and Google at cost; we take
   * a management fee and never touch it. It still has to appear, because "$545 a month" next to a
   * line that quietly requires another $500 of platform spend is the same surprise bill this module
   * was rewritten to remove. Zero when the plan has no pass-through lines.
   */
  passThroughMonthly: number
  /** the owner-facing sentences behind that figure, straight from the catalog's own price notes */
  passThroughNotes: string[]
}

/**
 * Lines whose catalog price note names money paid to somebody else. The note is the source of
 * truth and we never invent a number, so a note with no stated minimum contributes nothing to the
 * total and simply says so in words.
 */
function passThroughOf(lines: MonthlyLine[]): { monthly: number; notes: string[] } {
  const notes: string[] = []
  let monthly = 0
  for (const l of lines) {
    if (l.held || l.have) continue
    const note = svc(l.id)?.prices?.[0]?.note
    if (!note || !/at cost|pass ?-?through/i.test(note)) continue
    notes.push(plainCostNote(note))
    monthly += Math.round(passthroughMonthlyMinimumCents([note]) / 100)
  }
  return { monthly, notes }
}

export interface MonthlyEdits {
  off?: ReadonlySet<string>
  added?: ReadonlySet<string>
}

/**
 * Services that only make sense for a business with a fixed address the public can walk into.
 *
 * Citations match a name to an ADDRESS; sampling booths and concierge outreach send a human to a
 * place. Sell these to a delivery-only brand and you have taken money for work that cannot land —
 * and in the citations case you may actively harm a listing. So "we serve anywhere" excludes them
 * rather than quietly billing for them.
 *
 * Google Business Profile is deliberately NOT here. A delivery brand can hold a service-area
 * listing, and whether that is right for a given business is a judgement, not a rule this file
 * should make.
 */
const ADDRESS_BOUND = new Set(['local-seo', 'listings-sync', 'street-sampling', 'concierge'])

/** How far the owner is trying to reach. Only the last value changes composition today. */
export type Reach = 'walk' | 'local' | 'city' | 'region' | 'anywhere'

export function excludedByReach(reach?: Reach): string[] {
  return reach === 'anywhere' ? [...ADDRESS_BOUND] : []
}

/**
 * "Do not do this" has to actually stop us doing it.
 *
 * The avoid list was collected and then ignored — an owner could say "nobody on camera" and still be
 * quoted a video engine. Only the constraints that genuinely rule out a SERVICE are listed here. The
 * rest ("no emoji", "never name a competitor", "stay out of the news") are tone, not scope: they
 * belong in the brief the work is made from, and they ride along on the draft instead.
 */
const AVOID_EXCLUDES: Record<string, readonly string[]> = {
  'Discounts and deals': ['incentive-design', 'loyalty'],
  'Staff or faces on camera': ['video-engine', 'video-single', 'staff-advocacy'],
  'Alcohol front and centre': ['bar-events'],
}

export function excludedByAvoid(avoid?: readonly string[]): string[] {
  if (!avoid?.length) return []
  return [...new Set(avoid.flatMap((a) => AVOID_EXCLUDES[a] ?? []))]
}

/** The constraints we cannot enforce by dropping a service — they steer the work, not the mix. */
export function toneConstraints(avoid?: readonly string[]): string[] {
  return (avoid ?? []).filter((a) => !AVOID_EXCLUDES[a])
}

const svc = (id: string) => (GENERATED_CATALOG as PricedService[]).find((s) => s.id === id)

/** The owner-facing role line for a service: reuse the goalPlay copy the catalog already carries. */
function roleOf(s: PricedService): string {
  return s.goalPlays?.[0]?.role ?? s.desc
}

function lineOf(s: PricedService, heldMap: Map<string, string>, flags: Partial<MonthlyLine> = {}): MonthlyLine {
  const p = s.prices?.[0]
  return {
    id: s.id,
    name: s.name,
    desc: s.desc,
    role: roleOf(s),
    stage: stepOf(s.id),
    amount: p?.amount ?? 0,
    kind: p?.kind ?? 'one-time',
    unit: p?.unit,
    held: heldMap.get(s.id) ?? null,
    ...flags,
  }
}

/**
 * Compose the month.
 *
 * Foundations are always present (they are the table stakes, and an owner who already has one gets
 * it marked `have` and uncounted rather than hidden, so they can see we checked). Growth is packed
 * by leverage while the amortised monthly load holds. Held services are pulled in for VISIBILITY
 * only when the plan would otherwise have reached them, and never counted against the budget.
 */
export function composeMonthlyPlan(
  budgetMonthly: number,
  have: readonly string[] = [],
  edits: MonthlyEdits = {},
  goals?: readonly string[],
  reach?: Reach,
  shift = false,
  avoid?: readonly string[],
  assets?: readonly string[],
  signals?: MonthlySignals,
  /**
   * DATED MODE (an opening, an event): the campaign IS one-time work, so the "months only" depth
   * rule below is exactly backwards for it — it froze the plan at coverage regardless of budget,
   * and the dial did nothing. In dated mode the budget is the LAUNCH TOTAL (setup plus the first
   * month of anything ongoing) and depth packs the goal's own authored priority ladder while that
   * total holds. `priorityCap` limits depth to candidates at or above that rung (used by the dial
   * anchors); -1 means coverage only. Ongoing plans are byte-identical to before.
   */
  opts?: { dated?: boolean; priorityCap?: number },
): MonthlyPlan {
  const dated = opts?.dated ?? false
  const cap = opts?.priorityCap
  const added = edits.added ?? new Set<string>()
  const haveSet = new Set(have)
  /* Reach rules out address-bound work; avoid rules out work the owner has told us not to do. Both
   * are hard exclusions — nothing in either set can be taken, at any budget. */
  const blockedByReach = new Set([...excludedByReach(reach), ...excludedByAvoid(avoid)])
  const missing: string[] = []
  const chosen: { s: PricedService; have: boolean; extra?: boolean; why?: string }[] = []

  /*
   * THE WHY-LAYER'S CAUSE MAP, computed once before any pass. A line's reason is the most
   * specific true thing: owner-held beats a live cause, a live cause (signal, worked-before,
   * asset boost, slow-shift aim) beats the pass default, and the pass default says honestly
   * that the recipe and the budget put it there. Same precedence as the ranking itself, so a
   * line can never cite a lean the composer did not make.
   */
  const causes = tiltWhys(signals)
  if (shift) for (const c of shiftCandidates()) if (!causes.has(c.id)) causes.set(c.id, WHY['why.shift'])
  for (const id of assetsBoost(assets)) if (!causes.has(id)) causes.set(id, WHY['why.asset'])
  const taken = new Set<string>()
  let load = 0
  let start = 0
  let nextUp: { name: string; addlMonthly: number } | null = null

  const ranked = rankedCandidates(goals, shift, assets, signals)
  /* Proven losers (measured HERE): still eligible for coverage — the demotion in the ranking
   * means the walk-down only reaches one as last resort — but never bought for DEPTH. We do not
   * deepen a plan with work this business already watched flop. */
  const droppedHere = signalTilt(signals).dropped

  /*
   * WHAT WE CAN ACTUALLY DELIVER, INCLUDING THE SECOND-ORDER CASE.
   *
   * isServiceReady answers "is this service switched on", but a setup whose every consumer is held
   * is also undeliverable — a guest list nobody can email is a filing cabinet. That orphan rule ran
   * only at the END, so a coverage pass could fill a funnel step with a service that then rendered
   * as held, leaving the step visibly empty. It showed as naming a slow stretch DROPPING a step from
   * a reviews plan: the shift pulled crm-list into the pool, crm-list won the step, and crm-list is
   * orphaned because everything downstream of it needs a send rail we do not have.
   *
   * Computed once over the whole candidate pool rather than the chosen set, so it does not depend on
   * what we happen to pick — which keeps it stable and non-circular.
   */
  const orphanHeld = new Set(heldServices(ranked.map((c) => c.id), SEND_DEPS).map((h) => h.id))
  const deliverable = (id: string) => isServiceReady(id) && !orphanHeld.has(id)

  /**
   * Take a candidate if we can. Three things cost nothing against the monthly dial:
   *   have   the owner already has it. Shown so they can see we checked; never billed.
   *   held   we cannot deliver it. Shown so the shape of the plan is visible; never billed.
   *   setup  one-time work. It is quoted as its own number, not charged against the monthly dial.
   * A held service used to consume budget it would never spend, which starved the real work — the
   * single nastiest version of this bug, because the money vanished into something we do not do.
   *
   * `required` is how the coverage passes say "this one is the quote, not a purchase". It overrides
   * the dial for SETUP only. Ongoing work still has to fit, because the dial is the monthly promise
   * and a plan that quietly bills $475 a month against a $150 dial is the exact lie this module was
   * rewritten to remove. If a step's cheapest ongoing option does not fit, that step stays uncovered
   * and the honest floor rises to say so.
   */
  const consider = (id: string, required = false, why?: string): 'taken' | 'unaffordable' | 'skip' => {
    if (taken.has(id) || blockedByReach.has(id)) return 'skip'
    const s = svc(id)
    if (!s) {
      missing.push(id)
      return 'skip'
    }
    if (haveSet.has(id)) {
      chosen.push({ s, have: true, why: WHY['why.have'] })
      taken.add(id)
      return 'taken'
    }
    if (!deliverable(id)) {
      /* Held lines explain themselves through `held`; a why on top would compete with it. */
      chosen.push({ s, have: false })
      taken.add(id)
      return 'taken'
    }
    const r = recurringOf(s)
    if (dated) {
      /* The launch total is the promise: setup plus the first month of anything ongoing. Coverage
       * (`required`) is the quote itself and is always taken — the floor anchor reports its cost. */
      if (!required && start + load + (startOf(s) + r) > budgetMonthly) return 'unaffordable'
    } else if (load + r > budgetMonthly && !(required && r === 0)) return 'unaffordable'
    chosen.push({ s, have: false, why: causes.get(id) ?? why })
    taken.add(id)
    load += r
    start += startOf(s)
    return 'taken'
  }

  /*
   * PASS 0 — IF THEY PICKED IT, THE THING THEY PICKED IS IN THE PLAN.
   *
   * PRIORITY 1 MEANS "THIS SERVICE *IS* THE GOAL", and a goal that declares one always gets it.
   * Without this, "catering and parties" produced a plan with no catering engine in it: the engine
   * sits in the same funnel step as the photo library, the library is a foundation and therefore
   * sorts first, and coverage — which only takes ONE line per step — handed the slot to the photos.
   * An owner picking a goal and not finding it in the result would rightly stop trusting the screen.
   *
   * Only priority 1 counts, deliberately. Goals derived from catalog weights have no single headline
   * (their priorities cluster at 4 to 6, because no service claims to be the whole answer to "more
   * new people"), so this pass correctly does nothing for them and the leverage ranking decides.
   */
  for (const g of goals ?? []) {
    for (const c of candidatesForGoal(g)) {
      if (c.priority === 1 && deliverable(c.id) && !blockedByReach.has(c.id) && svc(c.id)) consider(c.id, true, WHY['why.headline'])
    }
  }

  /*
   * PASS 1 — COVER THE FUNNEL BEFORE DEEPENING ANY PART OF IT.
   *
   * One deliverable service per step, best-ranked first, taken whatever it costs. This is the whole
   * fix, and it kills three defects at once:
   *   - a small budget used to buy every foundation and nothing recurring, so an owner answering
   *     "$300 a month" was billed $2,680 and got no ongoing work at all;
   *   - $800 used to cover fewer funnel steps than $600, because the packer would buy a second
   *     awareness service before a first retention one;
   *   - coverage was not monotonic in budget, which is indefensible to an owner who just paid more.
   *
   * A thin plan that reaches all four steps beats a fat plan with a hole in it, because the hole is
   * where the money leaks out — that is exactly what the chain on the plan screen has been saying
   * all along, and the engine now agrees with it.
   */
  for (const step of MONTHLY_STEPS) {
    /*
     * Walk DOWN the step's candidates until one is actually taken, rather than trying the top one
     * and giving up. The single-try version had the same shape as the bug this pass exists to kill:
     * a step's best candidate can be ongoing work that does not fit the dial, and abandoning the
     * step there left it uncovered while a cheaper option sat one row below. It showed up as naming
     * a slow stretch REMOVING a step from a reviews plan — more input, less plan.
     */
    for (const c of ranked) {
      if (stepOf(c.id) !== step.stage || taken.has(c.id) || !deliverable(c.id) || blockedByReach.has(c.id) || !svc(c.id)) continue
      if (consider(c.id, true, fill(WHY['why.coverage'], { step: step.name })) === 'taken') break
    }
  }

  /* PASS 2 — one measurement line, so the plan can be judged later. A plan nobody can grade is
   * worth less than a smaller one that can be. */
  const meas = ranked.find((c) => stepOf(c.id) === 'backstage' && !taken.has(c.id) && deliverable(c.id))
  if (meas) consider(meas.id, true, WHY['why.measure'])

  /*
   * PASS 3 — DEPTH IS ONGOING WORK ONLY. The dial buys months, never setups.
   *
   * Extra one-time work is offered under "add more" instead of being added for them. This is the
   * difference between a quote and a filled basket: an owner who says "$300 a month" was being
   * handed $3,035 of setup they never asked for, because the packer treated a $700 photo shoot as
   * costing $58 a month and helped itself. Setup is now only ever bought to cover a step, or by the
   * owner deliberately choosing it.
   */
  for (const c of ranked) {
    if (droppedHere.has(c.id)) continue
    /* Dated depth honors the goal's authored ladder: the anchor computations cap the rung. */
    if (dated && cap != null && c.best > cap) continue
    const s = svc(c.id)
    /* The months-only rule holds for ongoing plans; a dated campaign's depth IS one-time work. */
    if (!dated && s && deliverable(c.id) && !taken.has(c.id) && recurringOf(s) === 0) continue
    const r = consider(c.id, false, dated ? WHY['why.depth.dated'] : WHY['why.depth'])
    if (r === 'unaffordable' && !nextUp) {
      const svcx = svc(c.id)!
      const gap = dated
        ? startOf(svcx) + recurringOf(svcx) - (budgetMonthly - start - load)
        : recurringOf(svcx) - (budgetMonthly - load)
      const short = Math.max(5, Math.ceil(gap / 5) * 5)
      nextUp = { name: svcx.name, addlMonthly: short }
    }
  }

  /* Anything the owner added by hand, beyond what the budget reached. */
  for (const id of added) {
    if (taken.has(id)) continue
    const s = svc(id)
    if (s) {
      chosen.push({ s, have: false, extra: true, why: WHY['why.added'] })
      taken.add(id)
    }
  }

  /*
   * REMOVALS ARE SUBTRACTION, APPLIED LAST — never a reason to re-pack.
   *
   * They used to be skipped inside the loop, which freed budget and let a later candidate in, so
   * taking something out could RAISE the bill. An owner removing a line means "I do not want this",
   * not "spend my money on something else".
   */
  const off = edits.off ?? new Set<string>()
  const kept = chosen.filter((c) => !off.has(c.s.id))

  const heldMap = new Map(heldServices(kept.map((c) => c.s.id), SEND_DEPS).map((h) => [h.id, h.reason]))
  const order = [...MONTHLY_STEPS.map((s) => s.stage), 'backstage'] as readonly string[]

  const lines = kept
    .map((c) => lineOf(c.s, heldMap, { have: c.have, extra: c.extra, why: c.why }))
    .sort((a, b) => order.indexOf(a.stage) - order.indexOf(b.stage))

  const bill = monthlyBill(lines)
  const pass = passThroughOf(lines)
  return {
    lines,
    nextUp,
    missing: [...new Set(missing)],
    quote: {
      start: bill.once,
      monthly: bill.monthly,
      nothingRecurs: bill.monthly === 0,
      passThroughMonthly: pass.monthly,
      passThroughNotes: pass.notes,
    },
  }
}

/** What we actually charge. A held line and a line the owner already has are never counted. */
export function monthlyBill(lines: MonthlyLine[]) {
  let once = 0
  let monthly = 0
  for (const l of lines) {
    if (l.held || l.have) continue
    if (l.kind === 'monthly') monthly += l.amount
    else once += l.amount
  }
  return { once, monthly }
}

/** Everything else the catalog could add to a step, for the builder's "add more". */
export function addablesForStep(step: MonthlyStepKey, lines: MonthlyLine[]): MonthlyLine[] {
  const inPlan = new Set(lines.map((l) => l.id))
  const cands = (GENERATED_CATALOG as PricedService[]).filter(
    (s) => !inPlan.has(s.id) && stepOf(s.id) === step && (s.goalPlays?.length ?? 0) > 0,
  )
  const heldMap = new Map(heldServices(cands.map((s) => s.id), SEND_DEPS).map((h) => [h.id, h.reason]))
  return cands.map((s) => lineOf(s, heldMap))
}

/* ── handing the plan to the rest of the portal ─────────────────────────────────────────── */

/**
 * Turn the monthly plan into a real CampaignDraft, so it can enter the machinery that already
 * exists: createCampaign -> work orders -> content drafts -> the owner's sign-off gate -> the
 * publish cron -> outcomes. Nothing downstream needs to know this plan came from a different
 * builder; it is a normal campaign the moment it lands.
 *
 * WHAT IS AND IS NOT BILLED, enforced here rather than left to the UI:
 *   held   `included: false`. summarize() only totals included lines, so a service whose rail does
 *          not exist yet rides along VISIBLY and is never charged. This is the gap that mattered:
 *          the plan screen has always shown held lines honestly, but until now nothing stopped the
 *          ship path from billing them anyway.
 *   have   `included: false` + optOut 'have-it' — the reason the type already has for exactly this.
 *   rest   included, and charged.
 *
 * `sourceCatalogId` is deliberately unset. That field drives POST /api/campaigns' coming-soon guard,
 * which gates whole store CARDS; a monthly plan is not a card, and claiming one would make the
 * guard answer a question about the wrong thing. The equivalent protection here is per-SERVICE and
 * stricter: service-availability already excluded every undeliverable line above.
 */
export function toCampaignDraft(
  lines: MonthlyLine[],
  opts: {
    budgetMonthly: number
    goalKey?: string
    name?: string
    /**
     * Everything else the owner told us. It does not change WHICH services get bought — what to put
     * in front of people, who to reach and what tone to avoid changes how the work is MADE, not the
     * mix — but it has to travel with the plan or asking for it was theatre. Three of these were
     * collected and dropped on the floor before this existed.
     */
    brief?: {
      /** the owner's own words. Carried verbatim so whoever does the work reads what was asked. */
      described?: string
      shape?: string
      when?: string
      until?: string
      /** 'asap' or an ISO date — when an ongoing plan should begin. */
      start?: string
      assets?: string[]
      promote?: string[]
      audience?: string[]
      reach?: string
      shift?: string[]
      avoid?: string[]
      notes?: string
      /* Offer economics (never defaulted — asked/read only for offer-shaped campaigns). */
      offerTerms?: string
      offerLimit?: string
      offerExpiry?: string
      /** Pre-launch target on the recipe's own proxy metric (reporting + pivot flag). */
      successTarget?: number
      /** The restaurant's capacity to absorb a demand spike, and who briefs staff. */
      capacity?: string
    },
  },
): Record<string, unknown> {
  const items = lines.map((l, i) => ({
    id: `mp-${l.id}-${i}`,
    serviceId: l.id,
    name: l.name,
    plain: l.name,
    does: l.role.split(/[.,]/)[0].slice(0, 60),
    stage: l.stage === 'backstage' ? 'foundation' : l.stage,
    price: l.amount,
    cadence:
      l.kind === 'monthly'
        ? { kind: 'recurring', every: 'monthly' }
        : l.kind === 'per-unit'
          ? { kind: 'per-occurrence', unit: l.unit ?? 'each' }
          : { kind: 'one-time' },
    eta: etaLabelFor(l.id),
    why: l.why ?? l.role,
    included: !l.held && !l.have,
    ...(l.have ? { optOut: 'have-it' as const } : {}),
    lock: 'editable' as const,
  }))

  /* GUIDE-ONLY MOVES (laws 2+3): the owner's own moves ride the draft as $0 serviceable:false
   * lines — before this, the free work simply evaporated at Start. Appended to the DRAFT, not to
   * MonthlyPlan.lines: the dial screen and the composer's output are untouched, which is what
   * keeps the absent-signals golden trivially true. lineTotal zeroes them, mintableServiceLine
   * refuses them, the LineCard drawer renders their steps. Emitted per funnel step the plan
   * actually covers, so a plan with no found work does not hand out found homework. */
  const coveredSteps = new Set(lines.filter((l) => !l.have).map((l) => l.stage))
  const guideItems = MONTHLY_STEPS.filter((st) => coveredSteps.has(st.stage)).flatMap((st) =>
    guideMovesForMonthly(st.stage).map((g) => ({
      id: `mp-guide-${g.key}`,
      serviceId: `guide:${g.key}`,
      name: g.title,
      plain: g.why,
      does: 'You do this one, with our guide',
      stage: st.stage,
      price: 0,
      cadence: { kind: 'one-time' as const },
      eta: `${g.minutes} min`,
      why: g.why,
      included: true,
      lock: 'editable' as const,
      producer: 'diy' as const,
      serviceable: false,
      guideKey: g.key,
    })),
  )

  return {
    id: 'new',
    name: opts.name ?? 'Monthly marketing plan',
    intent: 'ongoing',
    path: 'strategist',
    phase: 'review',
    budgetMonthly: opts.budgetMonthly,
    items: [...items, ...guideItems],
    planned: true,
    ...(opts.goalKey ? { goalKey: opts.goalKey } : {}),
    ...(opts.brief ? { brief: opts.brief } : {}),
  }
}


/**
 * The point past which more money buys nothing.
 *
 * The catalog is finite and a lot of it is held on rails that do not exist, so above some figure
 * every extra dollar is unspent. An owner sliding a budget deserves to be told that rather than
 * discovering it on the invoice, so the screen can say "we have already included everything we can
 * run today". Returns null when the ceiling is above the range we ever ask about.
 */
/** The dial past which there is no more ongoing work to buy. Setup is not capped by the dial, so
 *  this is now purely a monthly figure — which is what the slider was always claiming to be. */
export function budgetCeiling(goals?: readonly string[], reach?: Reach, shift = false, signals?: MonthlySignals): number | null {
  const at = (b: number) => composeMonthlyPlan(b, [], {}, goals, reach, shift, undefined, undefined, signals).quote.monthly
  const top = at(100000)
  for (const b of [100, 200, 300, 500, 800, 1200, 1600, 2000, 3000, 4000, 6000, 8000, 10000]) {
    if (at(b) >= top) return b
  }
  return null
}

/**
 * THE HONEST FLOOR. Below this the plan can be set up but nothing keeps running afterwards, which
 * is a thing to say out loud rather than a thing to quietly sell. Derived from the cheapest ongoing
 * work we can actually deliver, so it moves when the catalog does.
 */
export function monthlyFloor(goals?: readonly string[], reach?: Reach, shift = false, signals?: MonthlySignals): number {
  const rich = composeMonthlyPlan(100000, [], {}, goals, reach, shift, undefined, undefined, signals)
  const prices = rich.lines.filter((l) => !l.held && l.kind === 'monthly').map((l) => l.amount)
  return prices.length ? Math.min(...prices) : 0
}

/**
 * WHERE THE DIAL SHOULD OPEN — on the smallest plan that is WHOLE, not on the owner's wallet.
 *
 * Whole means every funnel step we can actually keep running, is running. Starting here and letting
 * results argue for more is the opposite of anchoring on someone's maximum and packing it: the
 * number goes UP only once there is evidence, and the owner is the one who moves it.
 */
/* All three dial anchors thread the SAME signals as the live plan. If they composed without,
 * a dropped service that happens to be the cheapest recurring line would make the floor name a
 * price the actual plan can never hit, and the recommendation would converge on the wrong dial. */
/**
 * Dial anchors for a DATED campaign, in launch-total dollars (setup plus the first month of any
 * ongoing work). Floor = coverage only, the smallest honest launch. Recommended = coverage plus
 * the goal's moment-making rungs (authored priority 6 and up the ladder: the press push, the
 * creator collab, the launch graphic). Ceiling = everything the goal's ladder can genuinely use —
 * past it the extra money would go unspent, and we say so.
 */
export function datedAnchors(
  goals?: readonly string[],
  reach?: Reach,
  shift = false,
  avoid?: readonly string[],
  assets?: readonly string[],
  signals?: MonthlySignals,
): { floor: number; recommended: number; ceiling: number } {
  const total = (priorityCap?: number) => {
    const q = composeMonthlyPlan(1e9, [], {}, goals, reach, shift, avoid, assets, signals, { dated: true, priorityCap }).quote
    return q.start + q.monthly
  }
  const floor = total(-1)
  const recommended = Math.max(floor, total(6))
  const ceiling = Math.max(recommended, total())
  return { floor, recommended, ceiling }
}

export function recommendedMonthly(goals?: readonly string[], reach?: Reach, shift = false, signals?: MonthlySignals): number {
  const rich = composeMonthlyPlan(100000, [], {}, goals, reach, shift, undefined, undefined, signals)
  const wantSteps = new Set(rich.lines.filter((l) => !l.held && l.kind === 'monthly').map((l) => l.stage))
  const ceiling = budgetCeiling(goals, reach, shift, signals) ?? 3000
  let step = 25
  for (let b = step; b <= ceiling; b += step) {
    const p = composeMonthlyPlan(b, [], {}, goals, reach, shift, undefined, undefined, signals)
    const got = new Set(p.lines.filter((l) => !l.held && !l.have && l.kind === 'monthly').map((l) => l.stage))
    if ([...wantSteps].every((st) => got.has(st))) return b
    if (b >= 500) step = 50
    if (b >= 2000) step = 100
  }
  return ceiling
}
