/**
 * guide-moves — law 3 enforced at build time: no orphan move without a real guide.
 *
 * What this locks: every key a goal can emit exists in GUIDE_MOVES with 2+ concrete steps; a
 * guide-only line bills zero and never counts in the bill; the adapter emits at most 3 per
 * system goal and none for unmapped goals; the mint predicate refuses guide lines AND the
 * empty-serviceId phantom (the pre-existing hole this chunk closed); and the row mapping
 * round-trips the flag so a saved draft cannot silently become billable.
 *
 * Run: npx tsx --tsconfig scripts/sim/tsconfig.json scripts/sim/guide-moves.ts
 */
import { Suite } from './lib'
import { GUIDE_MOVES, GUIDE_MOVES_FOR_GOAL, guideMovesFor } from '../../src/lib/campaigns/data/guide-moves'
import { isSystemGoal } from '../../src/lib/campaigns/builder/compose-plan'
import { lineTotal, summarize, type LineItem } from '../../src/lib/campaigns/types'
import { draftFromBuilder } from '../../src/lib/campaigns/builder/adapter'
import { mintableServiceLine } from '../../src/lib/campaigns/service-work-orders'
import { lineItemToRow, rowToLineItem } from '../../src/lib/campaigns/server'

const s = new Suite()

s.group('Law 3: every emittable key has a real guide behind it')
{
  for (const [goal, entries] of Object.entries(GUIDE_MOVES_FOR_GOAL)) {
    for (const e of entries) {
      const g = GUIDE_MOVES[e.key]
      s.check(`${goal}/${e.key}: guide exists`, !!g)
      s.check(`${goal}/${e.key}: 2+ steps, each with label and detail`,
        !!g && g.steps.length >= 2 && g.steps.every((st) => st.label.length > 3 && st.detail.length > 20))
      s.check(`${goal}/${e.key}: honest minutes (5..120)`, !!g && g.minutes >= 5 && g.minutes <= 120)
    }
    s.check(`${goal}: at most 3 mapped`, entries.length <= 3)
    // The vocabulary pin: map keys are the CARD ids the adapter passes (firstvisit/nights/…).
    // This exact drift shipped once — goalKey ('new-customers') matched nothing and every plan
    // silently emitted zero guides.
    s.check(`${goal}: is a real system goal id`, isSystemGoal(goal))
  }
  // EVERY move in the record, mapped or not: a mechanism ref can reach any of them, so a
  // 1-step move anywhere is illegal (a mutant proved the per-goal loop above missed unmapped ones).
  for (const g of Object.values(GUIDE_MOVES)) {
    s.check(`${g.key}: 2+ real steps`, g.steps.length >= 2 && g.steps.every((st) => st.label.length > 3 && st.detail.length > 20))
    s.check(`${g.key}: honest minutes (5..120)`, g.minutes >= 5 && g.minutes <= 120)
    s.check(`${g.key}: no em dash in owner copy`, !g.why.includes('—') && g.steps.every((st) => !st.detail.includes('—')))
  }
}

s.group('Money honesty: a guide-only line can never bill')
{
  const guide: LineItem = {
    id: 'x', serviceId: 'guide:own-counter', name: 'x', plain: '', does: '', stage: 'foundation',
    price: 999, cadence: { kind: 'one-time' }, eta: '', included: true, lock: 'editable',
    producer: 'diy', serviceable: false, guideKey: 'own-counter',
  }
  s.check('even a mispriced guide line totals 0', lineTotal(guide) === 0)
  s.check('and adds nothing to the bill', summarize([guide]).oneTimeOnDelivery === 0 && summarize([guide]).perMonth === 0)
}

s.group('The adapter emits guides for system goals, and only there')
{
  const fv = draftFromBuilder({ itemId: 'firstvisit', status: 'approve', vals: {} })
  const guides = fv.items.filter((it) => it.serviceable === false)
  s.check(`firstvisit: ${guides.length} guide line(s), ≤ 3`, guides.length > 0 && guides.length <= 3)
  s.check('every one carries a resolvable guideKey', guides.every((it) => !!it.guideKey && !!GUIDE_MOVES[it.guideKey]))
  s.check('every one is $0, owner-run, one-time', guides.every((it) => lineTotal(it) === 0 && it.producer === 'diy' && it.cadence.kind === 'one-time'))
  s.check('distinct synthetic ids (guide:<key>)', new Set(guides.map((g) => g.serviceId)).size === guides.length && guides.every((g) => g.serviceId.startsWith('guide:')))

  const billWithout = summarize(fv.items.filter((it) => it.serviceable !== false))
  const billWith = summarize(fv.items)
  s.check('the bill is byte-identical with and without them', JSON.stringify(billWith) === JSON.stringify(billWithout))

  const gbp = draftFromBuilder({ itemId: 'gbp', status: 'approve', vals: {} })
  s.check('a non-system card emits none', !gbp.items.some((it) => it.serviceable === false))
}

s.group('The mint predicate refuses what must never mint')
{
  const base = { included: true, serviceId: 'gbp-posts' }
  s.check('a normal service line mints', mintableServiceLine(base))
  s.check('a guide-only line never mints', !mintableServiceLine({ ...base, serviceable: false }))
  s.check('an owner-run line never mints', !mintableServiceLine({ ...base, producer: 'diy' }))
  s.check('the EMPTY serviceId phantom is dead', !mintableServiceLine({ ...base, serviceId: '' }))
  s.check('a content line never mints here', !mintableServiceLine({ ...base, serviceId: 'content-reel' }))
  s.check('an opted-out line never mints', !mintableServiceLine({ ...base, optOut: 'have-it' }))
}

s.group('Round-trip: a saved guide line cannot come back billable')
{
  const guide: LineItem = {
    id: 'li-guide-storefront', serviceId: 'guide:storefront', name: 'Put it in your window',
    plain: 'why', does: 'You do this one, with our guide', stage: 'foundation', price: 0,
    cadence: { kind: 'one-time' }, eta: '20 min', included: true, lock: 'editable',
    producer: 'diy', serviceable: false, guideKey: 'storefront',
  }
  const back = rowToLineItem(lineItemToRow('c1', 'cl1', guide, 0) as Record<string, unknown>)
  s.check('serviceable:false survives the round trip', back.serviceable === false)
  s.check('guideKey survives the round trip', back.guideKey === 'storefront')
  s.check('and it still bills zero', lineTotal(back) === 0)

  const normal: LineItem = { ...guide, id: 'li-1', serviceId: 'gbp-posts', producer: 'team', serviceable: undefined, guideKey: undefined, price: 150 }
  const nback = rowToLineItem(lineItemToRow('c1', 'cl1', normal, 0) as Record<string, unknown>)
  s.check('a normal line stays serviceable (undefined, not false)', nback.serviceable !== false && nback.guideKey === undefined)
}

s.report('Guide moves')
