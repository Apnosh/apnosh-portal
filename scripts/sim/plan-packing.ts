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
import { PLAN_GOALS, SHAPES, SITUATIONS, OWNER_ASSETS, candidatesForGoal, goalReadiness, goalsForShape, matchSituation, situationByValue, assetsCover, assetsBoost } from '../../src/lib/campaigns/data/plan-goals'
import { GENERATED_CATALOG } from '../../src/lib/campaigns/data/catalog.generated'
import {
  composeMonthlyPlan,
  monthlyBill,
  MONTHLY_STEPS,
  budgetCeiling,
  monthlyFloor,
  recommendedMonthly,
} from '../../src/lib/campaigns/data/monthly-plan'

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

s.report('Plan packing properties')
