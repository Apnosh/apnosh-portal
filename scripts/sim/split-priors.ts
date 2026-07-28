/**
 * split-priors — the advisory layer says true things quietly, or nothing at all.
 *
 * Locks: the priors tables are internally sane (floors are shares, low, and never sum past 1 for
 * a goal), the stage-spend rollup agrees with the bill's own money rules, advisories fire on a
 * genuinely lopsided plan and stay silent on a balanced one, every advisory carries the
 * data-maturity phrase (law 7), and a blank concept degrades to the base tables without a throw.
 *
 * Run: npx tsx scripts/sim/split-priors.ts
 */
import { Suite } from './lib'
import { stageSpend, totalMonthly } from '../../src/lib/campaigns/builder/stage-spend'
import { checkSplit, floorsFor, conceptGroup } from '../../src/lib/campaigns/builder/split-priors'
import { summarize, type LineItem, type PlanMove } from '../../src/lib/campaigns/types'
import type { Concept } from '../../src/lib/goals/types'

const s = new Suite()

const li = (serviceId: string, price: number, monthly = true, over: Partial<LineItem> = {}): LineItem => ({
  id: `li-${serviceId}`, serviceId, name: serviceId, plain: '', does: '', stage: 'aware',
  price, cadence: monthly ? { kind: 'recurring', every: 'monthly' } : { kind: 'one-time' },
  eta: '', included: true, lock: 'editable', ...over,
} as LineItem)
const mv = (serviceId: string, stage: string): PlanMove => ({ serviceId, stage, role: '' })

s.group('The priors tables are internally sane')
{
  const CONCEPTS: (Concept | null)[] = ['qsr', 'fast_casual', 'casual', 'fine_dining', 'bar', 'cafe', 'mobile', 'delivery_only', 'catering_heavy', null]
  for (const goal of ['firstvisit', 'nights', 'regulars', 'reviews']) {
    for (const c of CONCEPTS) {
      const floors = floorsFor(c, goal)
      const sum = floors.reduce((n, f) => n + f.floor, 0)
      s.check(`${goal}/${c ?? 'blank'}: ${floors.length} floor(s), sum ${Math.round(sum * 100)}% ≤ 60%`, sum <= 0.6)
      for (const f of floors) {
        s.check(`${goal}/${c ?? 'blank'}/${f.stage}: floor is a low share (0 < ${f.floor} ≤ 0.25)`, f.floor > 0 && f.floor <= 0.25)
      }
    }
  }
  s.check('every concept maps to a group', conceptGroup(null) === 'mainstream' && conceptGroup('qsr') === 'value' && conceptGroup('fine_dining') === 'craft')
}

s.group('Stage spend agrees with the bill')
{
  const items = [
    li('gbp-posts', 85), li('crm-list', 40), li('paid-ads', 300),
    li('gbp-setup', 100, false), // one-time, not part of monthly split
    li('welcome-seq', 60, true, { included: false }), // excluded exactly as summarize excludes it
    li('newsletter', 90, true, { optOut: 'diy' }),
  ]
  const moves = [mv('gbp-posts', 'be-found'), mv('crm-list', 'capture-return'), mv('paid-ads', 'get-discovered'), mv('gbp-setup', 'be-found')]
  const spend = stageSpend(items, moves)
  s.check('monthly lands on the moves\' stages', spend['be-found']?.monthly === 85 && spend['capture-return']?.monthly === 40 && spend['get-discovered']?.monthly === 300)
  s.check('one-time lands as one-time, never monthly', spend['be-found']?.oneTime === 100)
  s.check('excluded and opted-out lines never count (matching summarize)', totalMonthly(spend) === 425 && summarize(items).perMonth === 425)
  s.check('an item no move claims lands in other, not dropped', stageSpend([li('mystery', 10)], moves)['other']?.monthly === 10)
}

s.group('Advisories: fire lopsided, stay silent balanced, always cite')
{
  // Lopsided firstvisit: all monthly money in discovery, be-found (floor 20%) starved.
  const lop = [li('paid-ads', 400), li('gbp-posts', 20)]
  const lopMoves = [mv('paid-ads', 'get-discovered'), mv('gbp-posts', 'be-found')]
  const fired = checkSplit(lop, lopMoves, 'casual', 'firstvisit', { 'be-found': 'Be found' })
  s.check('a starved be-found fires', fired.some((a) => a.stage === 'be-found'))
  s.check('at most 2 advisories', fired.length <= 2)
  s.check('the advisory speaks the stage TITLE, not the key', fired[0]?.line.startsWith('Be found'))
  for (const a of fired) {
    s.check(`${a.stage}: carries the maturity phrase (law 7)`, a.line.endsWith('Our estimate.'))
    s.check(`${a.stage}: no em dash in owner copy`, !a.line.includes('—'))
  }

  // Balanced: be-found 30%, capture 15% — both floors hold.
  const bal = [li('gbp-posts', 120), li('crm-list', 60), li('paid-ads', 220)]
  const balMoves = [mv('gbp-posts', 'be-found'), mv('crm-list', 'capture-return'), mv('paid-ads', 'get-discovered')]
  s.check('a balanced plan is silent', checkSplit(bal, balMoves, 'casual', 'firstvisit').length === 0)

  s.check('no moves (not a system plan) → silent', checkSplit(lop, undefined, 'casual', 'firstvisit').length === 0)
  s.check('all-one-time plan → silent (nothing to split)', checkSplit([li('gbp-setup', 100, false)], lopMoves, 'casual', 'firstvisit').length === 0)
  s.check('blank concept falls back without throwing', Array.isArray(checkSplit(lop, lopMoves, null, 'firstvisit')))
}

s.group('Concept tweaks change the advice where they should')
{
  const craft = floorsFor('fine_dining', 'firstvisit')
  s.check('fine dining gains a give-reason floor', craft.some((f) => f.stage === 'give-reason'))
  s.check('and drops the discovery floor (craft wins on reasons, not reach)', !craft.some((f) => f.stage === 'get-discovered'))
  const value = floorsFor('qsr', 'firstvisit')
  s.check('a value spot gains a discovery floor', value.some((f) => f.stage === 'get-discovered'))
  const bar = floorsFor('bar', 'nights')
  s.check('a bar gains the slow-night draw floor', bar.some((f) => f.stage === 'draw' && f.floor === 0.2))
}

s.group('Vocabulary pin: floors are keyed by the CARD ids the call site passes')
{
  // The exact drift that shipped in the guide rail: the call site passed goalKey
  // ('new-customers'), the map spoke card ids, and the feature silently never fired. checkSplit
  // is called with itemId now; this pins that every system card id actually has floors, and
  // that the display vocabulary matches nothing.
  for (const id of ['firstvisit', 'nights', 'regulars', 'reviews']) {
    s.check(`${id}: has base floors`, floorsFor(null, id).length > 0)
  }
  for (const wrong of ['new-customers', 'slow-nights']) {
    s.check(`display key '${wrong}' matches nothing`, floorsFor(null, wrong).length === 0)
  }
}

s.report('Split priors')
