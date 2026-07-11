#!/usr/bin/env tsx
/**
 * Harness for the delivered-work rating layer (Phase D creator layer).
 * Exercises the PURE rules with injected fake rows — NO database reads or
 * writes. Mirrors what POST /api/dashboard/work-rating enforces via
 * validateRating, plus the aggregate math the profile surfaces display.
 *
 * Run: node_modules/.bin/tsx scripts/verify-work-ratings.ts
 */
import { validateRating, computeAggregate, ratingLabel, isRealCreatorId, RATABLE_STATUSES, type RatableOrder } from '../src/lib/campaigns/work-ratings-core'

let pass = 0
let fail = 0
function check(name: string, ok: boolean, detail?: string) {
  if (ok) { pass++; console.log(`  PASS  ${name}`) }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`) }
}

const CLIENT = '11111111-1111-4111-8111-111111111111'
const OTHER_CLIENT = '22222222-2222-4222-8222-222222222222'
const VENDOR = '33333333-3333-4333-8333-333333333333'

// Injected fake order rows (shape matches what the route derives from getWorkOrder).
const delivered: RatableOrder = { clientId: CLIENT, creatorId: VENDOR, status: 'delivered' }
const approved: RatableOrder = { clientId: CLIENT, creatorId: VENDOR, status: 'approved' }
const inProgress: RatableOrder = { clientId: CLIENT, creatorId: VENDOR, status: 'in_progress' }
const offered: RatableOrder = { clientId: CLIENT, creatorId: VENDOR, status: 'offered' }
const declined: RatableOrder = { clientId: CLIENT, creatorId: VENDOR, status: 'declined' }
const teamMade: RatableOrder = { clientId: CLIENT, creatorId: 'v_maya', status: 'delivered' }   // internal pool id

console.log('validateRating — the route gate')

// happy paths
check('delivered order, own client, 5 stars -> ok', validateRating(delivered, CLIENT, false, 5).ok)
check('approved order, own client, 1 star -> ok', validateRating(approved, CLIENT, false, 1).ok)

// client mismatch
{
  const v = validateRating(delivered, OTHER_CLIENT, false, 5)
  check('client mismatch rejected (403)', !v.ok && v.status === 403, JSON.stringify(v))
}

// undelivered
{
  const a = validateRating(inProgress, CLIENT, false, 5)
  const b = validateRating(offered, CLIENT, false, 5)
  const c = validateRating(declined, CLIENT, false, 5)
  check('in_progress rejected (409)', !a.ok && a.status === 409, JSON.stringify(a))
  check('offered rejected (409)', !b.ok && b.status === 409, JSON.stringify(b))
  check('declined rejected (409)', !c.ok && c.status === 409, JSON.stringify(c))
}

// non-creator (internal team) order
{
  const v = validateRating(teamMade, CLIENT, false, 5)
  check('internal-team order rejected (400)', !v.ok && v.status === 400, JSON.stringify(v))
}

// duplicate
{
  const v = validateRating(delivered, CLIENT, true, 4)
  check('duplicate rating rejected (409)', !v.ok && v.status === 409, JSON.stringify(v))
}

// missing order
{
  const v = validateRating(null, CLIENT, false, 5)
  check('unknown order rejected (404)', !v.ok && v.status === 404, JSON.stringify(v))
}

// stars bounds + type
for (const bad of [0, 6, -1, 2.5, NaN, '5', null, undefined] as unknown[]) {
  const v = validateRating(delivered, CLIENT, false, bad)
  check(`stars ${String(bad)} rejected (400)`, !v.ok && v.status === 400, JSON.stringify(v))
}
check('stars 3 accepted', validateRating(delivered, CLIENT, false, 3).ok)

console.log('\nisRealCreatorId — creator-produced check')
check('vendor UUID is real', isRealCreatorId(VENDOR))
check('pool id v_maya is not', !isRealCreatorId('v_maya'))
check('pool id p_theo is not', !isRealCreatorId('p_theo'))
check('empty is not', !isRealCreatorId(''))
check('null is not', !isRealCreatorId(null))

console.log('\nRATABLE_STATUSES — delivered work only')
check('delivered ratable', RATABLE_STATUSES.has('delivered'))
check('approved ratable', RATABLE_STATUSES.has('approved'))
check('revision not ratable', !RATABLE_STATUSES.has('revision'))
check('accepted not ratable', !RATABLE_STATUSES.has('accepted'))

console.log('\ncomputeAggregate — avg/count/rounding')
{
  const a = computeAggregate([5, 5, 4])
  check('avg of [5,5,4] = 4.7', a?.avg === 4.7 && a?.count === 3, JSON.stringify(a))
}
{
  const a = computeAggregate([5])
  check('single 5 -> 5 (1)', a?.avg === 5 && a?.count === 1, JSON.stringify(a))
}
{
  const a = computeAggregate([1, 2])
  check('avg of [1,2] = 1.5', a?.avg === 1.5 && a?.count === 2, JSON.stringify(a))
}
{
  const a = computeAggregate([4, 4, 5])
  check('avg of [4,4,5] = 4.3 (rounds 4.333)', a?.avg === 4.3 && a?.count === 3, JSON.stringify(a))
}
{
  const a = computeAggregate([3, 4])
  check('avg of [3,4] = 3.5 (no over-rounding)', a?.avg === 3.5, JSON.stringify(a))
}
check('zero ratings -> null (honest empty)', computeAggregate([]) === null)
check('garbage stars filtered out', computeAggregate([0, 9, NaN]) === null)
{
  const a = computeAggregate([0, 5, 9])
  check('mixed garbage keeps only valid rows', a?.avg === 5 && a?.count === 1, JSON.stringify(a))
}

console.log('\nratingLabel — display words')
check('null -> "No ratings yet"', ratingLabel(null) === 'No ratings yet')
check('4.8/12 -> "4.8 (12 ratings)"', ratingLabel({ avg: 4.8, count: 12 }) === '4.8 (12 ratings)')
check('5/1 -> "5 (1 rating)"', ratingLabel({ avg: 5, count: 1 }) === '5 (1 rating)')

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
console.log('ALL PASS')
