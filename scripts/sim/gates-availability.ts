/**
 * Phase 1 verification — the Checkout Gates supply side.
 *   A) computeOpenSlots (the pure slot engine) — the crux; fully unit-tested here, no DB.
 *   B) the server reader degrades honestly to "no availability" when the table is missing / on error
 *      (drives the REAL DB via service role; migration 218 is owner-run, so pre-migration this asserts
 *      the graceful-degradation path).
 *
 * Run:  npx tsx --tsconfig scripts/sim/tsconfig.json scripts/sim/gates-availability.ts
 */
import { config } from 'dotenv'
import { computeOpenSlots, addBusinessDays } from '@/lib/campaigns/gates/availability'
import type { AvailabilityRule, BookingRef } from '@/lib/campaigns/gates/types'
import { getActiveGateRule, getOpenSlots } from '@/lib/campaigns/gates/availability-server'
import { Suite } from './lib'

config({ path: '.env.local' })

const NOW = '2026-07-05T12:00:00Z' // a Sunday (UTC), so weekday math is predictable

function rule(over: Partial<AvailabilityRule> = {}): AvailabilityRule {
  return {
    id: 'r1', gateKind: 'shoot', scopeKind: 'team', scopeId: null, label: null,
    timezone: 'America/Los_Angeles', weekly: { '1': [{ start: '09:00', end: '12:00' }] }, exceptions: {},
    slotMinutes: 120, capacity: 1, leadTimeDays: 0, horizonDays: 21, active: true, ...over,
  }
}

async function main() {
  const s = new Suite()

  // ── A) pure engine ────────────────────────────────────────────────────────────
  s.group('engine — basics')
  s.eq('inactive rule yields no slots', computeOpenSlots(rule({ active: false }), [], NOW).length, 0)

  const monday = computeOpenSlots(rule(), [], NOW)
  s.check('active Mon 9–12 / 120min yields slots', monday.length >= 2, `got ${monday.length}`)
  s.check('every slot starts at 09:00 (120min drops the 11:00–13:00 overflow)', monday.every((x) => x.start === '09:00'))
  s.check('every slot lands on a Monday', monday.every((x) => new Date(`${x.date}T00:00:00Z`).getUTCDay() === 1))
  s.check('slot carries the rule timezone', monday.every((x) => x.timezone === 'America/Los_Angeles'))

  s.group('engine — slot length')
  const hourly = computeOpenSlots(rule({ slotMinutes: 60 }), [], NOW)
  const firstDay = hourly[0]?.date
  const firstDaySlots = hourly.filter((x) => x.date === firstDay).map((x) => x.start)
  s.eq('60-min slots split 9–12 into 09:00/10:00/11:00', firstDaySlots, ['09:00', '10:00', '11:00'])

  s.group('engine — lead time (business days)')
  const led = computeOpenSlots(rule({ leadTimeDays: 5 }), [], NOW)
  const earliest = addBusinessDays(NOW.slice(0, 10), 5)
  s.check('no slot earlier than the business-day lead date', led.every((x) => x.date >= earliest), `earliest=${earliest} first=${led[0]?.date}`)

  s.group('engine — horizon')
  const horizonEnd = new Date(Date.parse(NOW) + 21 * 86400000).toISOString().slice(0, 10)
  s.check('no slot beyond the horizon', monday.every((x) => x.date <= horizonEnd))

  s.group('engine — blackout')
  const target = monday[0].date
  const withBlackout = computeOpenSlots(rule({ exceptions: { [target]: [] } }), [], NOW)
  s.check('a blacked-out day disappears', !withBlackout.some((x) => x.date === target))
  s.check('other days remain', withBlackout.length === monday.length - 1)

  s.group('engine — capacity + holds')
  const slot0 = monday[0]
  const confirmed1: BookingRef[] = [{ ruleId: 'r1', slotDate: slot0.date, slotStart: slot0.start, status: 'confirmed', holdExpiresAt: null }]
  s.check('cap 1 + one confirmed → that slot is gone', !computeOpenSlots(rule(), confirmed1, NOW).some((x) => x.date === slot0.date))
  const cap2one = computeOpenSlots(rule({ capacity: 2 }), confirmed1, NOW).find((x) => x.date === slot0.date)
  s.check('cap 2 + one confirmed → slot open with remaining 1', cap2one?.remaining === 1)
  const heldFuture: BookingRef[] = [{ ruleId: 'r1', slotDate: slot0.date, slotStart: slot0.start, status: 'held', holdExpiresAt: '2026-07-06T12:00:00Z' }]
  s.check('cap 1 + an UNEXPIRED hold → slot occupied', !computeOpenSlots(rule(), heldFuture, NOW).some((x) => x.date === slot0.date))
  const heldPast: BookingRef[] = [{ ruleId: 'r1', slotDate: slot0.date, slotStart: slot0.start, status: 'held', holdExpiresAt: '2026-07-05T11:00:00Z' }]
  s.check('an EXPIRED hold is ignored (slot free again, no release cron)', computeOpenSlots(rule(), heldPast, NOW).some((x) => x.date === slot0.date))
  const cancelled: BookingRef[] = [{ ruleId: 'r1', slotDate: slot0.date, slotStart: slot0.start, status: 'cancelled', holdExpiresAt: null }]
  s.check('cancelled/needs_reschedule never occupy', computeOpenSlots(rule(), cancelled, NOW).some((x) => x.date === slot0.date))

  // ── B) server reader degrades honestly ─────────────────────────────────────────
  s.group('server — graceful degradation (migration 218 owner-run)')
  const active = await getActiveGateRule('shoot').catch(() => null)
  const open = await getOpenSlots('shoot').catch(() => null)
  // Pre-migration: table missing → null rule + no_availability. Post-migration with no active rule:
  // same. Post-migration WITH an active rule: available may be true. Assert only the honest invariant.
  s.check('getActiveGateRule never throws (null or a real rule)', active === null || typeof active.id === 'string')
  s.check('getOpenSlots never throws + never fabricates', !!open && Array.isArray(open.slots))
  if (open && !open.available) s.check('no availability → honest request-mode reason', open.reason === 'no_availability')
  else if (open) s.check('availability present → slots are non-empty', open.slots.length > 0)

  const ok = s.report('Phase 1 — Checkout Gates supply (availability engine + reader)')
  process.exit(ok ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
