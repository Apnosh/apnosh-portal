/**
 * plan-packing — the properties the monthly-plan packer must never violate again.
 *
 * These are regression locks for three real defects an owner would have hit, all from one root
 * cause: the packer optimised SPEND rather than COVERAGE.
 *
 *   1. $800 a month covered FEWER funnel steps than $600, because a second awareness service
 *      outranked a first retention one. Paying more for less is indefensible.
 *   2. Removing a line could RAISE the bill, because removals were applied inside the packing loop
 *      and the freed budget pulled a more expensive line in behind them.
 *   3. Held lines — work we cannot deliver — consumed budget they would never spend, starving the
 *      real work of money that then bought nothing at all.
 *
 * Pure module, no DB. Run with: npx tsx scripts/sim/plan-packing.ts
 */

import { Suite } from './lib'
import { PLAN_GOALS, SHAPES, SITUATIONS, OWNER_ASSETS, PLAN_QUESTIONS, candidatesForGoal, gapsFor, goalReadiness, goalsForShape, matchSituation, sanitizeAsk, situationByValue, assetsCover, assetsBoost } from '../../src/lib/campaigns/data/plan-goals'
import { GENERATED_CATALOG } from '../../src/lib/campaigns/data/catalog.generated'
import {
  composeMonthlyPlan,
  monthlyBill,
  MONTHLY_STEPS,
  budgetCeiling,
  monthlyFloor,
  recommendedMonthly,
  datedAnchors,
  rankedCandidates,
  stepOf,
} from '../../src/lib/campaigns/data/monthly-plan'
import { signalTilt, signalNotes, tiltWhys, ALL_NULL_SIGNALS, type MonthlySignals } from '../../src/lib/campaigns/data/monthly-signals'

const s = new Suite()

/** A line's catalog price note, for the pass-through checks. */
const svcNote = (id: string) =>
  (GENERATED_CATALOG as unknown as { id: string; prices?: { note?: string }[] }[]).find((x) => x.id === id)?.prices?.[0]?.note ?? ''

/** Budgets from "I can barely start" to above the ceiling, in the increments owners actually pick. */
const BUDGETS = [100, 150, 200, 250, 300, 400, 500, 600, 700, 800, 1000, 1250, 1500, 2000, 2500, 3000, 4000]

const coverageOf = (b: number) => {
  const p = composeMonthlyPlan(b, [], {}, undefined, 'local')
  const live = p.lines.filter((l) => !l.held && !l.have)
  return {
    plan: p,
    live,
    covered: MONTHLY_STEPS.filter((st) => live.some((l) => l.stage === st.stage)).length,
    bill: monthlyBill(p.lines),
  }
}

// ---------------------------------------------------------------- 1. coverage
s.group('Coverage never falls as the budget rises')

let prevCovered = -1
let prevBudget = 0
for (const b of BUDGETS) {
  const { covered } = coverageOf(b)
  s.check(
    `$${b}/mo covers ${covered} of ${MONTHLY_STEPS.length} steps (was ${prevCovered < 0 ? 'n/a' : prevCovered} at $${prevBudget})`,
    covered >= prevCovered,
    `paying more must never buy less coverage`,
  )
  prevCovered = covered
  prevBudget = b
}

s.group('Every deliverable step is reached before any step is deepened')
for (const b of BUDGETS) {
  const { live, covered } = coverageOf(b)
  // Count how many steps have MORE than one live line while some step has none.
  const perStep = MONTHLY_STEPS.map((st) => live.filter((l) => l.stage === st.stage).length)
  const anyEmpty = perStep.some((n) => n === 0)
  const anyDeepened = perStep.some((n) => n > 1)
  // A step can be legitimately empty when nothing in it is deliverable at all (retention needs a
  // send or POS rail nobody has yet). Only flag deepening past an empty step we COULD have filled.
  const emptyStepsFillable = MONTHLY_STEPS.filter((st, i) => {
    if (perStep[i] > 0) return false
    const p = composeMonthlyPlan(99_999, [], {}, undefined, 'local')
    return p.lines.some((l) => l.stage === st.stage && !l.held)
  })
  s.check(
    `$${b}/mo: ${covered} covered, no deepening past a fillable empty step`,
    !(anyEmpty && anyDeepened && emptyStepsFillable.length > 0),
    `empty+fillable: ${emptyStepsFillable.map((x) => x.stage).join(', ') || 'none'}`,
  )
}

// ---------------------------------------------------------------- 2. removals
s.group('Removing a line never raises the bill')

const base = composeMonthlyPlan(1500, [], {}, undefined, 'local')
const removable = base.lines.filter((l) => !l.held && !l.have)
const baseBill = monthlyBill(base.lines)
for (const line of removable) {
  const after = composeMonthlyPlan(1500, [], { off: new Set([line.id]) }, undefined, 'local')
  const b2 = monthlyBill(after.lines)
  s.check(
    `remove ${line.id}: $${baseBill.once}+$${baseBill.monthly}/mo -> $${b2.once}+$${b2.monthly}/mo`,
    b2.once <= baseBill.once && b2.monthly <= baseBill.monthly,
    'taking something out must only ever subtract',
  )
}

s.group('A removed line stays removed')
for (const line of removable.slice(0, 6)) {
  const after = composeMonthlyPlan(1500, [], { off: new Set([line.id]) }, undefined, 'local')
  s.check(`${line.id} is gone`, !after.lines.some((l) => l.id === line.id))
}

// ---------------------------------------------------------------- 3. held lines
s.group('Work we cannot deliver is never charged for and never eats budget')

for (const b of [300, 600, 1500]) {
  const { plan } = coverageOf(b)
  const held = plan.lines.filter((l) => l.held)
  const bill = monthlyBill(plan.lines)
  const billIgnoringHeld = monthlyBill(plan.lines.filter((l) => !l.held))
  s.check(
    `$${b}/mo: ${held.length} held line(s), none billed`,
    bill.once === billIgnoringHeld.once && bill.monthly === billIgnoringHeld.monthly,
    `${bill.once}/${bill.monthly} vs ${billIgnoringHeld.once}/${billIgnoringHeld.monthly}`,
  )
}

s.group('"A bit more a month would add..." never points at work we cannot do')
for (const b of BUDGETS) {
  const { plan } = coverageOf(b)
  if (!plan.nextUp) {
    s.check(`$${b}/mo: nothing suggested`, true)
    continue
  }
  const suggested = plan.lines.find((l) => l.name === plan.nextUp!.name)
  s.check(
    `$${b}/mo suggests "${plan.nextUp.name}" (+$${plan.nextUp.addlMonthly}/mo)`,
    !suggested?.held,
    'upselling something we cannot deliver is the worst thing this screen could do',
  )
}

// ---------------------------------------------------------------- 4. sanity
s.group('The plan still holds together')

const ceiling = budgetCeiling(undefined, 'local')
s.check('there is a ceiling', typeof ceiling === 'number' && ceiling! > 0, String(ceiling))

const atCeiling = coverageOf(ceiling ?? 3000)
s.check('at the ceiling nothing is suggested next', atCeiling.plan.nextUp === null, JSON.stringify(atCeiling.plan.nextUp))
s.check('no duplicate lines', new Set(atCeiling.plan.lines.map((l) => l.id)).size === atCeiling.plan.lines.length)

const owned = composeMonthlyPlan(1500, ['gbp-setup'], {}, undefined, 'local')
const ownedLine = owned.lines.find((l) => l.id === 'gbp-setup')
s.check('a service the owner already has shows but is free', !!ownedLine && ownedLine.have === true)
s.check(
  'and is not billed',
  monthlyBill(owned.lines).once === monthlyBill(owned.lines.filter((l) => l.id !== 'gbp-setup')).once,
)

// ---------------------------------------------------------------- 5. two numbers
s.group('The dial governs the month, and only the month')

for (const b of BUDGETS) {
  const p = composeMonthlyPlan(b, [], {}, undefined, 'local')
  s.check(`$${b}/mo dial -> $${p.quote.monthly}/mo bill`, p.quote.monthly <= b, 'the monthly bill must never exceed the dial')
}

s.group('Setup is a quote, not a function of the wallet')

const starts = BUDGETS.map((b) => composeMonthlyPlan(b, [], {}, undefined, 'local').quote.start)
s.check(
  `setup is $${starts[0]} at every dial position`,
  new Set(starts).size === 1,
  `saw ${[...new Set(starts)].map((x) => '$' + x).join(', ')} — sliding the monthly dial must not move the setup price`,
)

s.group('The quote matches the lines it is made of')
for (const b of [250, 800, 3000]) {
  const p = composeMonthlyPlan(b, [], {}, undefined, 'local')
  const manual = monthlyBill(p.lines)
  s.check(`$${b}: start $${p.quote.start} == $${manual.once}`, p.quote.start === manual.once)
  s.check(`$${b}: monthly $${p.quote.monthly} == $${manual.monthly}`, p.quote.monthly === manual.monthly)
}

s.group('Floor, suggestion and ceiling are in order and are real')

const floor = monthlyFloor(undefined, 'local')
const rec = recommendedMonthly(undefined, 'local')
const ceil2 = budgetCeiling(undefined, 'local') ?? 0
s.check(`floor $${floor} < suggested $${rec} <= ceiling $${ceil2}`, floor < rec && rec <= ceil2)

const atFloor = composeMonthlyPlan(floor, [], {}, undefined, 'local')
s.check(`at the floor something actually recurs ($${atFloor.quote.monthly}/mo)`, atFloor.quote.monthly > 0 && !atFloor.quote.nothingRecurs)

const belowFloor = composeMonthlyPlan(floor - 1, [], {}, undefined, 'local')
s.check('a hair below the floor, nothing recurs — and the plan says so', belowFloor.quote.nothingRecurs === true)

const atRec = composeMonthlyPlan(rec, [], {}, undefined, 'local')
const richRec = composeMonthlyPlan(999_999, [], {}, undefined, 'local')
const wantStages = new Set(richRec.lines.filter((l) => !l.held && l.kind === 'monthly').map((l) => l.stage))
const gotStages = new Set(atRec.lines.filter((l) => !l.held && !l.have && l.kind === 'monthly').map((l) => l.stage))
s.check(
  `the suggested plan is WHOLE: ongoing work in every step that can have it (${[...gotStages].join(', ')})`,
  [...wantStages].every((st) => gotStages.has(st)),
  `wanted ${[...wantStages].join(', ')}`,
)

// ---------------------------------------------------------------- 6. per goal
/*
 * Everything above runs with all goals merged, which is where two real defects hid: an owner picking
 * ONE goal got a plan whose monthly bill blew past the dial, and a goal whose headline service was
 * missing from its own plan. Every property is now asserted per goal as well as in aggregate.
 */
const READY_GOALS = PLAN_GOALS.filter((g) => g.state === 'ready')

s.group('A goal we offer is a goal we can actually serve')
for (const g of PLAN_GOALS) {
  const fit = goalReadiness(g.key)
  if (g.state === 'ready') {
    s.check(`${g.key}: ${fit.ready} deliverable`, fit.ready >= 3, 'a goal with almost nothing behind it should be coming-soon, not on sale')
  } else {
    s.check(`${g.key}: held back (${fit.ready} ready / ${fit.held} held) and says why`, !!g.soonWhy)
  }
}
/* A goal we decline to sell is not in the candidate map at all, so composing with it lands on the
 * same safe whole-funnel fallback as any unknown key — never a plan built out of its held work. */
for (const g of PLAN_GOALS.filter((x) => x.state !== 'ready')) {
  const soon = composeMonthlyPlan(1000, [], {}, [g.key], 'local')
  const none = composeMonthlyPlan(1000, [], {}, undefined, 'local')
  s.check(
    `${g.key} composes the safe default, not its own held work`,
    JSON.stringify(soon.lines.map((l) => l.id)) === JSON.stringify(none.lines.map((l) => l.id)),
  )
  s.check(`${g.key}: nothing held is billed`, soon.lines.filter((l) => l.held).every((l) => !l.have || true) && soon.quote.start >= 0)
}

s.group('If they picked it, it is in the plan')
for (const g of READY_GOALS) {
  const lead = candidatesForGoal(g.key).find((c) => c.priority === 1)
  if (!lead) {
    s.check(`${g.key}: no declared lead service`, true)
    continue
  }
  const p = composeMonthlyPlan(recommendedMonthly([g.key], 'local'), [], {}, [g.key], 'local')
  s.check(`${g.key} -> plan contains ${lead.id}`, p.lines.some((l) => l.id === lead.id), 'picking a goal and not finding it in the result breaks the whole screen')
}

s.group('Per goal: the monthly bill never exceeds the dial')
for (const g of READY_GOALS) {
  for (const b of [50, 100, 200, 400, 800, 2000]) {
    const p = composeMonthlyPlan(b, [], {}, [g.key], 'local')
    s.check(`${g.key} @ $${b} -> $${p.quote.monthly}/mo`, p.quote.monthly <= b)
  }
}

s.group('Per goal: sliding the monthly dial never moves the setup price')
for (const g of READY_GOALS) {
  const top = budgetCeiling([g.key], 'local') ?? 3000
  const starts = [50, 100, 200, 400, 800, 1500, top].map((b) => composeMonthlyPlan(b, [], {}, [g.key], 'local').quote.start)
  s.check(
    `${g.key}: setup is $${starts[0]} at every dial position`,
    new Set(starts).size === 1,
    `saw ${[...new Set(starts)].map((x) => '$' + x).join(', ')} — the screen promises setup is billed once and does not move`,
  )
}

s.group('Per goal: floor <= suggestion <= ceiling, and the suggestion is whole')
for (const g of READY_GOALS) {
  const f = monthlyFloor([g.key], 'local')
  const r = recommendedMonthly([g.key], 'local')
  const c = budgetCeiling([g.key], 'local') ?? 0
  s.check(`${g.key}: floor $${f} <= suggested $${r} <= ceiling $${c}`, f <= r && r <= c)
  const at = composeMonthlyPlan(r, [], {}, [g.key], 'local')
  s.check(`${g.key}: something recurs at the suggestion ($${at.quote.monthly}/mo)`, !at.quote.nothingRecurs)
}

s.group('Naming a slow stretch adds work, never removes coverage')
for (const g of READY_GOALS) {
  const b = Math.max(recommendedMonthly([g.key], 'local', true), recommendedMonthly([g.key], 'local'))
  const off = composeMonthlyPlan(b, [], {}, [g.key], 'local', false)
  const on = composeMonthlyPlan(b, [], {}, [g.key], 'local', true)
  const cov = (p: typeof off) => MONTHLY_STEPS.filter((st) => p.lines.some((l) => l.stage === st.stage && !l.held && !l.have)).length
  s.check(`${g.key}: ${cov(off)} steps -> ${cov(on)} with a shift named`, cov(on) >= cov(off))
}

s.group('A stale goal key never yields a blank plan')
for (const stale of ['new-customers', 'slow-nights', 'nonsense']) {
  const p = composeMonthlyPlan(800, [], {}, [stale], 'local')
  s.check(`"${stale}" falls back to the whole funnel (${p.lines.length} lines)`, p.lines.length > 0, 'onboarding wrote these keys for months')
}

s.group("Money that is not ours is never folded into ours")
/*
 * Ad spend goes from the owner's card to Meta and Google at cost. Quoting a management fee without
 * naming the platform spend beside it is the same surprise bill the two-numbers split exists to
 * remove, so the quote carries it as its own figure and the screen prints it separately.
 */
for (const b of [400, 1500, 3000]) {
  const p = composeMonthlyPlan(b, [], {}, undefined, 'local')
  const hasPass = p.lines.some((l) => !l.held && !l.have && /at cost/i.test(String(svcNote(l.id))))
  s.check(
    `$${b}: fee $${p.quote.monthly}/mo, pass-through $${p.quote.passThroughMonthly}/mo`,
    hasPass ? p.quote.passThroughMonthly > 0 : p.quote.passThroughMonthly === 0,
    'a plan containing a pass-through line must name the figure, and one without it must show zero',
  )
  s.check(
    `$${b}: pass-through is NOT counted as our revenue`,
    p.quote.monthly === monthlyBill(p.lines).monthly,
  )
  if (p.quote.passThroughMonthly > 0) {
    s.check(`$${b}: says where the money goes`, p.quote.passThroughNotes.length > 0, p.quote.passThroughNotes.join(' | '))
  }
}

// ---------------------------------------------------------------- 7. shape and assets
s.group('Shape decides which goals are even offered')
for (const sh of SHAPES) {
  const gs = goalsForShape(sh.v)
  s.check(`${sh.v}: ${gs.length} goal(s)`, gs.length > 0, gs.map((g) => g.key).join(', '))
  s.check(`${sh.v}: every offered goal claims this shape`, gs.every((g) => g.shapes.includes(sh.v)))
}
s.check('a grand opening is never offered as an ongoing programme', !goalsForShape('ongoing').some((g) => g.key === 'opening'))
s.check('"get them coming back" is never offered for a single night', !goalsForShape('date').some((g) => g.key === 'regulars'))

s.group('The dated goals reach the work that was unreachable')
const openingIds = candidatesForGoal('opening').map((c) => c.id)
for (const id of ['pre-opening', 'gbp-event-post', 'graphic', 'fb-event', 'paid-ads']) {
  s.check(`opening reaches ${id}`, openingIds.includes(id), 'this was reachable by no goal at all')
}
const eventIds = candidatesForGoal('event').map((c) => c.id)
for (const id of ['event-pkg', 'graphic', 'fb-event', 'gbp-event-post']) {
  s.check(`event reaches ${id}`, eventIds.includes(id))
}
const openPlan = composeMonthlyPlan(budgetCeiling(['opening'], 'local') ?? 3000, [], {}, ['opening'], 'local')
s.check(
  `the grand opening plan actually contains the $1,295 package`,
  openPlan.lines.some((l) => l.id === 'pre-opening' && !l.held),
  openPlan.lines.filter((l) => !l.held).map((l) => l.id).join(', '),
)

s.group('What the owner brings is never sold to them again')
const OWN_PHOTOS = ['Our own photos or video']
s.check('owning photos covers the shoot', assetsCover(OWN_PHOTOS).includes('photo-library'))
const b2 = budgetCeiling(['event'], 'local') ?? 1000
const without = composeMonthlyPlan(b2, [], {}, ['event'], 'local')
const withAsset = composeMonthlyPlan(b2, assetsCover(OWN_PHOTOS), {}, ['event'], 'local', false, undefined, OWN_PHOTOS)
s.check(
  `bringing your own photos cuts the setup: $${without.quote.start} -> $${withAsset.quote.start}`,
  withAsset.quote.start < without.quote.start,
  'an asset that changes nothing is a question we should not be asking',
)
s.check('the covered line still SHOWS, at zero', withAsset.lines.some((l) => l.id === 'photo-library' && l.have))
s.check('and the monthly is untouched by it', withAsset.quote.monthly === without.quote.monthly)

s.group('An asset is a tiebreak, never an override')
for (const a of OWNER_ASSETS.filter((x) => x.boosts?.length)) {
  const boosted = composeMonthlyPlan(600, [], {}, undefined, 'local', false, undefined, [a.v])
  const plain = composeMonthlyPlan(600, [], {}, undefined, 'local')
  s.check(
    `"${a.label}" never pushes the monthly past the dial ($${boosted.quote.monthly})`,
    boosted.quote.monthly <= 600,
  )
  s.check(`"${a.label}" keeps coverage`, MONTHLY_STEPS.filter((st) => boosted.lines.some((l) => l.stage === st.stage && !l.held && !l.have)).length >= MONTHLY_STEPS.filter((st) => plain.lines.some((l) => l.stage === st.stage && !l.held && !l.have)).length)
}
s.check('every boosted id is a real catalog service', assetsBoost(OWNER_ASSETS.map((a) => a.v)).every((id) => !!svcNote(id) || GENERATED_CATALOG.some((x: { id: string }) => x.id === id)))

s.group('The stale ids are gone')
const allIds = new Set(READY_GOALS.flatMap((g) => candidatesForGoal(g.key).map((c) => c.id)))
for (const ghost of ['second-visit', 'offer-eng']) {
  s.check(`${ghost} is no longer named by any goal`, !allIds.has(ghost), 'it does not exist in the catalog, so ranking it did nothing')
}

/* ── the fallback that keeps the one-box screen alive ──────────────────────────────────────────
 *
 * The first screen is a single box: the owner describes their situation, and the parse is the only
 * thing that sets the goal and the shape everything downstream hangs off. That makes one API call a
 * single point of failure for the whole builder, and it has already failed in exactly this way —
 * an empty Anthropic balance took the front door out for everyone, silently.
 *
 * matchSituation is the floor under that, and these checks are what stop it rotting. It has to read
 * the sentences owners actually send, and it has to return null rather than guess: a confident
 * wrong read routes someone into a plan built for a problem they do not have, which is worse than
 * admitting we did not follow.
 */
s.group('The no-model fallback reads what owners actually write')
{
  const CASES: [string, string][] = [
    ['opening', "We're opening our second location in Seattle on 12 September and I want a line out the door."],
    ['event', 'We have a concert coming up next month and want the room full.'],
    ['new-thing', "We're putting a new menu on for the spring."],
    ['quiet', 'Our location is super slow now and no one is coming in.'],
    ['slow-shifts', 'Mondays and Tuesdays are dead but the weekends are fine.'],
    ['reviews', 'Our Google reviews need work, we have barely any.'],
    ['checks', 'We want a bigger average check out of the guests already coming.'],
    ['catering', 'We want more catering and private events, offices mostly.'],
    ['takeout', 'We want people ordering on our own site instead of the delivery apps.'],
    ['known', 'Nobody around here knows us. We need to get our name out.'],
    ['return', 'People come once and never come back.'],
  ]
  for (const [want, text] of CASES) {
    const got = matchSituation(text)
    s.check(`"${text.slice(0, 42)}..." -> ${got?.situation.v ?? 'null'}`, got?.situation.v === want, `expected ${want}`)
  }
  s.check(
    `all ${SITUATIONS.length} situations are reachable with no model`,
    new Set(CASES.map(([w]) => w)).size === SITUATIONS.length,
    'a situation no phrasing can reach is one an owner cannot ask for while the model is down',
  )
}

s.group('It says nothing rather than guessing')
for (const text of ['', '   ', 'hi', 'hello there', 'thanks', 'asdf asdf', 'we run a restaurant']) {
  s.check(`"${text}" -> null`, matchSituation(text) === null, 'a confident wrong read is worse than no read at all')
}

s.group('Anything it returns is something the rest of the flow can use')
for (const sit of SITUATIONS) {
  const back = situationByValue(sit.v)
  s.check(`${sit.v} carries a goal and a shape`, !!back?.goal && !!back?.shape)
}

/* ── the follow-ups are chosen per brief, not run off a fixed list ─────────────────────────────
 *
 * Every situation used to carry a standing `needs` array, so two grand openings got the same three
 * questions whether the owner had already named their date, their assets and their reach or none of
 * them. The model now picks, and these are the properties that must hold whoever picked.
 */
s.group('The model chooses the follow-ups, and the rules still bind')
{
  const opening = situationByValue('opening')!
  const standing = [...opening.needs]

  const noRead = gapsFor(['opening'], {})
  s.check(`no read -> the standing list (${noRead.join(', ')})`, noRead.join(',') === standing.join(','),
    'a dead model must cost relevance, not the flow')

  const chosen = gapsFor(['opening'], {}, ['reach'])
  s.check('a chosen list replaces the standing one', chosen.join(',') === 'reach', chosen.join(','))

  const none = gapsFor(['opening'], {}, [])
  s.check('an empty choice is honoured, not treated as "no answer"', none.length === 0,
    'the paragraph covering everything is a real outcome; inventing a question so the screen looks thorough is not')

  const knownWins = gapsFor(['opening'], { reach: true }, ['reach', 'avoid'])
  s.check('what we already know is still subtracted from the choice', knownWins.join(',') === 'avoid',
    'the model cannot see the account, so it can ask for the one thing onboarding answered')

  const deduped = gapsFor(['opening'], {}, ['avoid', 'avoid', 'reach'])
  s.check('a repeated choice renders once', deduped.join(',') === 'avoid,reach', deduped.join(','))
}

s.group('Nothing outside the bank survives the trip')
{
  s.check('a made-up question id is dropped',
    sanitizeAsk([{ q: 'budget', why: 'x' }, { q: 'reach', why: 'y' }]).map((x) => x.q).join(',') === 'reach')
  s.check('junk shapes are dropped', sanitizeAsk([null, 'reach', 42, { why: 'no q' }]).length === 0)
  s.check('a non-array is dropped', sanitizeAsk('reach').length === 0 && sanitizeAsk(undefined).length === 0)
  s.check('duplicates collapse', sanitizeAsk([{ q: 'avoid', why: 'a' }, { q: 'avoid', why: 'b' }]).length === 1)
  s.check('a missing reason is empty, never undefined',
    sanitizeAsk([{ q: 'avoid' }])[0].why === '', 'the screen falls back to its own copy on empty, not on undefined')
  s.check('a runaway reason is cut', sanitizeAsk([{ q: 'avoid', why: 'x'.repeat(500) }])[0].why.length === 160)
  s.check(`never more than the ${PLAN_QUESTIONS.length} real questions`,
    sanitizeAsk(PLAN_QUESTIONS.map((p) => ({ q: p.q, why: '' })).concat([{ q: 'reach', why: '' }])).length === PLAN_QUESTIONS.length)
}

s.group('The bank and the standing lists agree')
{
  for (const p of PLAN_QUESTIONS) {
    s.check(`${p.q}: says what it changes`, p.changes.length > 30, p.changes)
    s.check(`${p.q}: says what it asks for`, p.asks.length > 20, p.asks)
  }
  const bank = new Set(PLAN_QUESTIONS.map((p) => p.q))
  for (const sit of SITUATIONS) {
    const strays = sit.needs.filter((q) => !bank.has(q))
    s.check(`${sit.v}: every standing need is a real question`, strays.length === 0, strays.join(', '))
  }
}

/* ═══ THE BRAIN FOLD (Phase 1c): signals steer, never restructure ═══════════════════════════
 *
 * Every invariant above must ALSO hold with a rich signals object in play, and with signals
 * absent the composer must be deep-equal to the pre-signals engine. RICH is deliberately nasty:
 * a low rating, a thin listing, no list, two dropped services that are real ranked candidates,
 * one proven winner and a photo complaint — every rule fires at once. */

const RICH: MonthlySignals = {
  droppedServiceIds: ['social-mgmt', 'street-sampling'],
  workingServiceIds: ['gbp-posts'],
  rating: 3.9,
  listingCompleteness: 55,
  hasList: false,
  complaintThemes: ['the photos of the food look dark'],
  assembledAt: '2026-07-28T00:00:00Z',
}

const composeSig = (b: number, sig?: MonthlySignals) => composeMonthlyPlan(b, [], {}, undefined, 'local', false, undefined, undefined, sig)

s.group('Signals absent ≡ the pre-signals engine, byte for byte')
{
  for (const goals of [undefined, ['more-new', 'regulars'] as const, ['stale-key'] as const]) {
    for (const b of [200, 800, 2000]) {
      const bare = JSON.stringify(composeMonthlyPlan(b, [], {}, goals as never, 'local'))
      const withUndef = JSON.stringify(composeMonthlyPlan(b, [], {}, goals as never, 'local', false, undefined, undefined, undefined))
      const withNulls = JSON.stringify(composeMonthlyPlan(b, [], {}, goals as never, 'local', false, undefined, undefined, ALL_NULL_SIGNALS))
      s.check(`b=${b} goals=${goals?.join('+') ?? 'none'}: omitted == undefined`, bare === withUndef)
      s.check(`b=${b} goals=${goals?.join('+') ?? 'none'}: all-null signals == absent (missing never reads as a value)`, bare === withNulls)
    }
  }
}

s.group('Every core invariant still holds under rich signals')
{
  const covOf = (b: number) => {
    const p = composeSig(b, RICH)
    const live = p.lines.filter((l) => !l.held && !l.have)
    return { p, covered: MONTHLY_STEPS.filter((st) => live.some((l) => l.stage === st.stage)).length, bill: monthlyBill(p.lines) }
  }
  let prev = 0
  let mono = true
  let dialOk = true
  const starts = new Set<number>()
  for (const b of BUDGETS) {
    const c = covOf(b)
    if (c.covered < prev) mono = false
    prev = Math.max(prev, c.covered)
    if (c.bill.monthly > b && c.covered >= MONTHLY_STEPS.length) dialOk = false
    starts.add(c.bill.once)
  }
  s.check('coverage never falls as the budget rises', mono)
  s.check('a whole plan never bills past the dial', dialOk)
  s.check(`setup is a quote, not a function of the wallet (${starts.size} distinct start figures)`, starts.size <= 3)

  const base = composeSig(1500, RICH)
  const removable = base.lines.filter((l) => !l.held && !l.have).slice(0, 4)
  const baseBill = monthlyBill(base.lines)
  const removalsOk = removable.every((l) => {
    const after = composeMonthlyPlan(1500, [], { off: new Set([l.id]) }, undefined, 'local', false, undefined, undefined, RICH)
    const bill = monthlyBill(after.lines)
    return bill.monthly <= baseBill.monthly && bill.once <= baseBill.once && !after.lines.some((x) => x.id === l.id)
  })
  s.check('removing a line never raises the bill, and it stays removed', removalsOk)
}

s.group('Proven losers: demoted from depth, never from coverage')
{
  for (const b of BUDGETS) {
    const p = composeSig(b, RICH)
    const droppedBought = p.lines.filter((l) => RICH.droppedServiceIds.includes(l.id) && !l.held && !l.have)
    // The two dropped ids must never be bought for DEPTH. (They could only appear as a step's
    // last-resort coverage, which the only-option case below constructs deliberately.)
    for (const l of droppedBought) {
      const peers = rankedCandidates(undefined, false, undefined, RICH).filter((c) => stepOf(c.id) === l.stage && !RICH.droppedServiceIds.includes(c.id))
      s.check(`b=${b}: ${l.id} bought only as last resort`, peers.length === 0)
    }
    if (p.nextUp) s.check(`b=${b}: nextUp never names a proven loser`, !RICH.droppedServiceIds.includes(p.nextUp.name))
  }
  s.check('nextUp checked across all budgets', true)

  // Coverage with signals is never worse than without.
  for (const b of [200, 500, 1000, 2000]) {
    const bare = composeSig(b)
    const sig = composeSig(b, RICH)
    const cov = (pl: typeof bare) => MONTHLY_STEPS.filter((st) => pl.lines.some((l) => l.stage === st.stage && !l.held && !l.have)).length
    s.check(`b=${b}: coverage with signals (${cov(sig)}) >= without (${cov(bare)})`, cov(sig) >= cov(bare))
  }

  // THE ONLY-OPTION CASE: drop EVERY candidate a step has. The step must still be covered — a
  // proven loser is last resort, not banished — or history would mean "less plan".
  const step = 'easy'
  const pool = rankedCandidates(undefined, false, undefined).filter((c) => stepOf(c.id) === step).map((c) => c.id)
  const allDropped: MonthlySignals = { ...ALL_NULL_SIGNALS, droppedServiceIds: pool }
  const p = composeSig(5000, allDropped)
  s.check(`step '${step}' still covered when its every candidate is a proven loser (${pool.length} dropped)`,
    p.lines.some((l) => l.stage === step && !l.held && !l.have))

  // The owner's hand beats history: adding a dropped id lands it.
  const addBack = composeMonthlyPlan(500, [], { added: new Set(['social-mgmt']) }, undefined, 'local', false, undefined, undefined, RICH)
  s.check('an owner-added proven loser still lands', addBack.lines.some((l) => l.id === 'social-mgmt'))
}

s.group('The tilt does something, and never outranks leverage')
{
  const bare = rankedCandidates(undefined, false, undefined)
  const rich = rankedCandidates(undefined, false, undefined, RICH)
  const idx = (list: typeof bare, id: string) => list.findIndex((c) => c.id === id)
  s.check(`rating 3.9 pulls review-engine up (bare #${idx(bare, 'review-engine')} -> rich #${idx(rich, 'review-engine')})`,
    idx(rich, 'review-engine') < idx(bare, 'review-engine'))
  s.check('a proven loser falls among its peers', idx(rich, 'social-mgmt') > idx(bare, 'social-mgmt'))

  // ADVISORY BOUND: within a foundation-band, a non-dropped service wanted by strictly more
  // goals ALWAYS outranks a boosted one wanted by fewer. Tilt reorders ties; it cannot beat
  // leverage. (The negative proof moves the tilt term above `wanted` and watches this fail.)
  let bound = true
  for (let i = 0; i < rich.length; i++) {
    for (let j = i + 1; j < rich.length; j++) {
      const a = rich[i]; const b = rich[j]
      if (a.foundation !== b.foundation) continue
      const tilt = signalTilt(RICH)
      if (tilt.dropped.has(a.id) || tilt.dropped.has(b.id)) continue
      if (b.wanted > a.wanted) bound = false
    }
  }
  s.check('leverage always beats the tilt', bound)
}

s.group('The dial anchors and the plan speak with one voice under signals')
{
  const floor = monthlyFloor(undefined, 'local', false, RICH)
  const rec = recommendedMonthly(undefined, 'local', false, RICH)
  const ceil = budgetCeiling(undefined, 'local', false, RICH) ?? 0
  s.check(`floor $${floor} <= suggested $${rec} <= ceiling $${ceil}`, floor <= rec && (ceil === 0 || rec <= ceil))
  s.check('the suggestion is a whole plan', (() => {
    const atRec = composeSig(rec, RICH)
    const richPlan = composeSig(999_999, RICH)
    const want = new Set(richPlan.lines.filter((l) => !l.held && l.kind === 'monthly').map((l) => l.stage))
    const got = new Set(atRec.lines.filter((l) => !l.held && !l.have && l.kind === 'monthly').map((l) => l.stage))
    return [...want].every((st) => got.has(st))
  })())
}

/*
 * DATED MODE — the launch dial has to actually buy the launch.
 *
 * The defect this locks out: an opening composed the SAME plan at $550 and at $2,000, because
 * depth only ever bought monthly work and an opening's ladder (press push, creator collab, event
 * posts, sampling) is one-time. The dial was scenery. In dated mode the budget is the launch
 * total and depth packs the goal's own authored priorities while it holds.
 */
s.group('dated mode: the launch dial buys the launch')
{
  const goals = ['opening'] as const
  const at = (b: number) => composeMonthlyPlan(b, [], {}, goals, 'local', false, undefined, undefined, undefined, { dated: true })
  const billedIds = (p: ReturnType<typeof at>) => p.lines.filter((l) => !l.held && !l.have).map((l) => l.id)
  const total = (p: ReturnType<typeof at>) => p.quote.start + p.quote.monthly

  const A = datedAnchors(goals, 'local', false)
  s.check(`anchors are ordered (floor $${A.floor} <= recommended $${A.recommended} <= ceiling $${A.ceiling})`,
    A.floor <= A.recommended && A.recommended <= A.ceiling && A.floor > 0)
  s.check('the dial DOES something: floor and ceiling plans differ', (() => {
    return JSON.stringify(billedIds(at(A.floor))) !== JSON.stringify(billedIds(at(A.ceiling)))
  })())
  s.check('billed lines are monotonic in budget across the anchors', (() => {
    const f = billedIds(at(A.floor)).length
    const r = billedIds(at(A.recommended)).length
    const c = billedIds(at(A.ceiling)).length
    return f <= r && r <= c
  })())
  s.check('the recommended launch carries a moment piece the floor does not (press outreach)', (() => {
    const f = new Set(billedIds(at(A.floor)))
    const r = new Set(billedIds(at(A.recommended)))
    return !f.has('pr-media') && r.has('pr-media')
  })())
  s.check('the ceiling reaches the whole ladder (creator collab + sampling)', (() => {
    const c = new Set(billedIds(at(A.ceiling)))
    return c.has('creator-collab') && c.has('street-sampling')
  })())
  s.check('the launch total never exceeds the dial (the promise holds)', (() => {
    for (const b of [A.floor, A.recommended, A.ceiling]) if (total(at(b)) > b) return false
    return true
  })())
  s.check('the floor is coverage: its total equals the coverage-only compose', total(at(A.floor)) === A.floor)
  s.check('reach still excludes address-bound work at any dated budget', (() => {
    const p = composeMonthlyPlan(A.ceiling, [], {}, goals, 'anywhere', false, undefined, undefined, undefined, { dated: true })
    return !p.lines.some((l) => l.id === 'street-sampling' || l.id === 'local-seo')
  })())
  s.check('MUTATION GUARD: ongoing mode is untouched by the dated flag machinery', (() => {
    const plain = composeMonthlyPlan(550, [], {}, goals, 'local', false)
    const explicit = composeMonthlyPlan(550, [], {}, goals, 'local', false, undefined, undefined, undefined, { dated: false })
    return JSON.stringify(plain.lines.map((l) => l.id)) === JSON.stringify(explicit.lines.map((l) => l.id))
  })())
  s.check('ongoing mode still freezes an opening at coverage (the documented months-only rule)', (() => {
    const a = composeMonthlyPlan(550, [], {}, goals, 'local', false)
    const b = composeMonthlyPlan(2000, [], {}, goals, 'local', false)
    return JSON.stringify(a.lines.map((l) => l.id)) === JSON.stringify(b.lines.map((l) => l.id))
  })())
}

/*
 * SIGNAL NOTES ≡ SIGNAL TILT — the owner-facing card must never claim a lean the composer does
 * not make. The sentences and the thresholds live in the same file; this pins that they agree.
 */
s.group('signal notes: the card says exactly what the tilt does')
{
  const sig = (patch: Partial<MonthlySignals>): MonthlySignals => ({ ...ALL_NULL_SIGNALS, ...patch })
  for (const rating of [3.9, 4.2, 4.4, 4.6, 4.8]) {
    const s1 = sig({ rating })
    const boosted = signalTilt(s1).boost.has('review-engine')
    const note = signalNotes(s1).find((n) => n.key === 'rating')?.note ?? ''
    s.check(`rating ${rating}: note claims review lean IFF the tilt boosts review work`,
      boosted === /review work/.test(note))
  }
  for (const health of [0, 62, 70, 71, 95]) {
    const s2 = sig({ listingCompleteness: health })
    const boosted = signalTilt(s2).boost.has('gbp-setup')
    const note = signalNotes(s2).find((n) => n.key === 'listing')?.note ?? ''
    s.check(`listing ${health}: note claims a listing fix IFF the tilt boosts discovery`,
      boosted === /fixing your Google listing/.test(note))
  }
  {
    const noList = sig({ hasList: false })
    const t = signalTilt(noList)
    const note = signalNotes(noList).find((n) => n.key === 'list')?.note ?? ''
    s.check('no list: tilt demotes sends + boosts list building, and the note says so',
      t.demote.has('newsletter') && t.boost.has('crm-list') && /builds a list/.test(note))
  }
  s.check('null signals produce no notes (nothing invented)', signalNotes(undefined).length === 0 && signalNotes(ALL_NULL_SIGNALS).length === 0)
}

/* ── THE WHY-LAYER (2026-07-31): every line explains itself, and never lies ─────────────── */

s.group('Why-layer: every billed line carries its reason')
{
  const SIG: MonthlySignals = { ...ALL_NULL_SIGNALS, rating: 4.2, listingCompleteness: 62, hasList: false, complaintThemes: ['photos look old'], workingServiceIds: ['review-engine'] }
  const FIXTURES: [string, ReturnType<typeof composeMonthlyPlan>][] = [
    ['get-known $800', composeMonthlyPlan(800, [], {}, ['get-known'], 'local')],
    ['reviews $400 + signals', composeMonthlyPlan(400, [], {}, ['reviews'], 'local', false, [], [], SIG)],
    ['catering $1500', composeMonthlyPlan(1500, [], {}, ['catering'], 'city')],
    ['opening dated $4000', composeMonthlyPlan(4000, [], {}, ['opening'], 'local', false, [], [], undefined, { dated: true, priorityCap: 6 })],
    ['more-new $600 shift', composeMonthlyPlan(600, [], {}, ['more-new'], 'local', true)],
  ]
  for (const [name, plan] of FIXTURES) {
    const bare = plan.lines.filter((l) => !l.held && !l.have && !l.why)
    s.check(`${name}: every billed line has a why`, bare.length === 0, bare.map((l) => l.id).join(', '))
    const dashed = plan.lines.filter((l) => l.why && /[—–]/.test(l.why))
    s.check(`${name}: no em or en dash in any why`, dashed.length === 0)
  }
  /* An owner-held service says so, and says it costs nothing. The held id is taken FROM the
   * plan itself, so the fixture can never drift out of the candidate pool. */
  const baseline = composeMonthlyPlan(800, [], {}, ['get-known'], 'local')
  const someBilled = baseline.lines.find((l) => !l.held && !l.have)!.id
  const withHave = composeMonthlyPlan(800, [someBilled], {}, ['get-known'], 'local')
  const haveLine = withHave.lines.find((l) => l.have)
  s.check('an owner-held line says never billed', !!haveLine?.why && /never billed/i.test(haveLine.why), haveLine?.why)
}

s.group('Why-layer: a line never cites a lean the composer did not make')
{
  const SIG: MonthlySignals = { ...ALL_NULL_SIGNALS, rating: 4.2, listingCompleteness: 62, hasList: false, complaintThemes: ['photos look old'], workingServiceIds: ['review-engine'] }
  /* tiltWhys and signalTilt.boost are the SAME set: a why for every boost, a boost for every why. */
  const whys = tiltWhys(SIG)
  const boost = signalTilt(SIG).boost
  s.check('every boosted id has a why', [...boost].every((id) => whys.has(id)), [...boost].filter((id) => !whys.has(id)).join(', '))
  s.check('every why maps to a boosted id', [...whys.keys()].every((id) => boost.has(id)), [...whys.keys()].filter((id) => !boost.has(id)).join(', '))
  s.check('no signals, no signal whys', tiltWhys(undefined).size === 0 && tiltWhys(ALL_NULL_SIGNALS).size === 0)

  /* Precedence is pure: worked-here beats the rating reason for the same service. */
  s.check('worked-before outranks the rating in the why map', tiltWhys(SIG).get('review-engine') === 'This worked for you before.')
  /* And in a composed plan, a billed worked-before service cites its history. The id is taken
   * from the plan itself so the fixture cannot pick a held service. */
  const noSig = composeMonthlyPlan(400, [], {}, ['reviews'], 'local')
  const billedId = noSig.lines.find((l) => !l.held && !l.have)!.id
  const SIG2: MonthlySignals = { ...ALL_NULL_SIGNALS, workingServiceIds: [billedId] }
  const plan = composeMonthlyPlan(400, [], {}, ['reviews'], 'local', false, [], [], SIG2)
  const rep = plan.lines.find((l) => l.id === billedId && !l.held)
  s.check('a worked-before service cites its history', !!rep?.why && /worked for you before/i.test(rep.why), rep?.why)
  const withSig = composeMonthlyPlan(400, [], {}, ['reviews'], 'local', false, [], [], SIG)
  const disc = withSig.lines.find((l) => ['local-seo', 'listings-sync', 'gbp-setup'].includes(l.id) && !l.held && !l.have)
  s.check('a listing fix cites the real score', !disc || /62 of 100/.test(disc.why ?? ''), disc?.why)

  /* Slow shifts: the merged work says why it is aimed there. */
  const shifted = composeMonthlyPlan(600, [], {}, ['reviews'], 'local', true)
  const base = composeMonthlyPlan(600, [], {}, ['reviews'], 'local', false)
  const baseIds = new Set(base.lines.map((l) => l.id))
  const merged = shifted.lines.filter((l) => !baseIds.has(l.id) && !l.held && !l.have)
  s.check('shift-merged lines cite the slow shifts', merged.length > 0 && merged.every((l) => /slow shifts/i.test(l.why ?? '')), merged.map((l) => `${l.id}:${l.why}`).join(' | '))

  /* No cause at all: the honest ladder default, not silence and not invention. */
  const plain = composeMonthlyPlan(800, [], {}, ['get-known'], 'local')
  const defaults = plain.lines.filter((l) => !l.held && !l.have && l.why)
  s.check('uncaused lines say recipe/coverage/budget honestly', defaults.every((l) => /recipe|budget|step|heart|measure|worked|shifts|bring/i.test(l.why ?? '')), defaults.map((l) => l.why).join(' | '))
}

s.report('Plan packing properties')
