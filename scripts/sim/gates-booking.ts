/**
 * Phase 2 verification — booking-at-checkout.
 *   A) gate derivation (pure): a shoot-bearing draft implies a required pre-checkout booking gate.
 *   B) hold → confirm cycle against the REAL DB (service role, self-cleaning). If migration 218 is
 *      applied, this exercises the full path (publish availability → hold a slot → capacity reflects
 *      it → confirm binds the campaign + seeds the real date). If NOT applied, it asserts the honest
 *      degradation (hold refuses with a setup error; no crash, no fake booking).
 *
 * Run:  npx tsx --tsconfig scripts/sim/tsconfig.json scripts/sim/gates-booking.ts
 */
import { config } from 'dotenv'
import { createAdminClient } from '@/lib/supabase/admin'
import { draftNeedsShoot, requiredBookingGates } from '@/lib/campaigns/gates/derive'
import { holdBooking, confirmBookingForPayment, getConfirmedBookingForCampaign } from '@/lib/campaigns/gates/booking-server'
import { computeOpenSlots } from '@/lib/campaigns/gates/availability'
import type { AvailabilityRule } from '@/lib/campaigns/gates/types'
import type { CampaignDraft, LineItem } from '@/lib/campaigns/types'
import { Suite } from './lib'

config({ path: '.env.local' })

const TEST_CLIENT = '2535fe50-0d78-411f-a59f-cfffbbd239b5'
const TAG = 'SIM_GATES_DELETE_ME'

function line(serviceId: string, over: Partial<LineItem> = {}): LineItem {
  return { id: 'li', serviceId, name: serviceId, plain: serviceId, does: '', stage: 'foundation', price: 100, cadence: { kind: 'one-time' }, eta: '', included: true, lock: 'editable', ...over }
}
const draft = (over: Partial<CampaignDraft>): CampaignDraft => ({ id: 'new', name: TAG, intent: 'one-off', path: 'strategist', budgetMonthly: 0, items: [], ...over })

async function tableExists(a: ReturnType<typeof createAdminClient>, name: string): Promise<boolean> {
  const { error } = await a.from(name).select('*').limit(1)
  // Treat both a truly-missing table (42P01) and a not-yet-reloaded PostgREST schema cache
  // (PGRST205 / "schema cache") as "not available" — either way the app degrades to request-mode.
  if (!error) return true
  return !(error.code === '42P01' || error.code === 'PGRST205' || /does not exist|schema cache/i.test(error.message))
}

async function main() {
  const a = createAdminClient()
  const s = new Suite()

  // ── A) gate derivation (pure) ──────────────────────────────────────────────────
  s.group('derive — shoot detection')
  s.check('needsShoot service (video-engine) ⇒ needs shoot', draftNeedsShoot(draft({ items: [line('video-engine')] })))
  s.check('shoot content beat (reel) ⇒ needs shoot', draftNeedsShoot(draft({ items: [line('content-reel')], brief: { templateId: 't', objective: '', audienceIds: [], channelIds: [], kpi: '', durationWeeks: 4, contentBeats: [{ week: 1, type: 'reel', label: '', channel: 'social' }], spec: {} } })))
  s.check('non-shoot service (gbp-setup) ⇒ no shoot', !draftNeedsShoot(draft({ items: [line('gbp-setup')] })))
  s.check('opted-out shoot line ⇒ no shoot', !draftNeedsShoot(draft({ items: [line('video-engine', { optOut: 'diy' })] })))
  s.check('diy-producer shoot line ⇒ no shoot', !draftNeedsShoot(draft({ items: [line('video-engine', { producer: 'diy' })] })))

  s.group('derive — gate shape')
  const gates = requiredBookingGates(draft({ items: [line('video-engine')] }))
  s.eq('one required pre-checkout shoot booking gate', gates.length, 1)
  s.check('gate is booking/shoot/pre-checkout/required', gates[0]?.kind === 'booking' && gates[0]?.gateKind === 'shoot' && gates[0]?.when === 'pre-checkout' && gates[0]?.required === true)
  s.eq('non-shoot draft ⇒ no gates', requiredBookingGates(draft({ items: [line('gbp-setup')] })).length, 0)

  // ── B) hold → confirm against the real DB ──────────────────────────────────────
  const has218 = (await tableExists(a, 'availability_rules')) && (await tableExists(a, 'bookings'))
  s.group('booking — migration state')
  s.check('detected availability tables', true, has218 ? 'migration 218 APPLIED — running full cycle' : 'migration 218 NOT applied — asserting degradation')

  if (!has218) {
    s.group('booking — graceful degradation (pre-218)')
    const h = await holdBooking({ clientId: TEST_CLIENT, paymentIntentId: `pi_${TAG}`, gateKind: 'shoot', date: '2026-08-10', start: '09:00' })
    s.check('hold refuses honestly (no active rule / setup)', h.ok === false)
    const conf = await getConfirmedBookingForCampaign('00000000-0000-0000-0000-000000000000')
    s.check('confirmed-booking read is null, never throws', conf === null)
    const ok = s.report('Phase 2 — booking-at-checkout')
    process.exit(ok ? 0 : 1)
  }

  // Full cycle. Publish an active rule with a wide weekday window, then drive a hold + confirm.
  let ruleId: string | null = null
  let campaignId: string | null = null
  const piId = `pi_${TAG}_${Date.now()}`
  try {
    await a.from('availability_rules').delete().eq('label', TAG)
    const { data: rule, error: ruleErr } = await a.from('availability_rules').insert({
      gate_kind: 'shoot', scope_kind: 'team', label: TAG, timezone: 'America/Los_Angeles',
      weekly: { '1': [{ start: '09:00', end: '17:00' }], '2': [{ start: '09:00', end: '17:00' }], '3': [{ start: '09:00', end: '17:00' }], '4': [{ start: '09:00', end: '17:00' }], '5': [{ start: '09:00', end: '17:00' }] },
      exceptions: {}, slot_minutes: 120, capacity: 1, lead_time_days: 3, horizon_days: 30, active: true,
    }).select('*').single()
    s.check('publish an active availability rule', !ruleErr && !!rule, ruleErr?.message)
    if (!rule) { s.report('Phase 2 — booking-at-checkout'); process.exit(1) }
    ruleId = rule.id as string

    const { data: camp } = await a.from('campaigns').insert({ client_id: TEST_CLIENT, name: TAG, path: 'strategist', status: 'shipped', phase: 'monitor' }).select('id').single()
    campaignId = camp!.id as string

    // The engine's own first open slot (uses the same rule → guaranteed pickable).
    const ruleObj: AvailabilityRule = { id: ruleId, gateKind: 'shoot', scopeKind: 'team', scopeId: null, label: TAG, timezone: 'America/Los_Angeles', weekly: rule!.weekly, exceptions: {}, slotMinutes: 120, capacity: 1, leadTimeDays: 3, horizonDays: 30, active: true }
    const firstOpen = computeOpenSlots(ruleObj, [], new Date().toISOString(), 5)[0]

    s.group('booking — hold')
    s.check('engine offers at least one open slot', !!firstOpen)
    const h = await holdBooking({ clientId: TEST_CLIENT, paymentIntentId: piId, gateKind: 'shoot', date: firstOpen.date, start: firstOpen.start })
    s.check('hold succeeds on an open slot', h.ok === true, h.ok ? undefined : h.error)
    if (h.ok) {
      s.check('hold has a 30-min expiry in the future', Date.parse(h.holdExpiresAt) > Date.now())
      // The same slot is now occupied (cap 1): the engine no longer offers it.
      const { data: live } = await a.from('bookings').select('rule_id, slot_date, slot_start, status, hold_expires_at').eq('rule_id', ruleId)
      const refs = (live ?? []).map((b) => ({ ruleId: b.rule_id as string, slotDate: b.slot_date as string, slotStart: b.slot_start as string, status: b.status as 'held', holdExpiresAt: b.hold_expires_at as string }))
      const stillOpen = computeOpenSlots(ruleObj, refs, new Date().toISOString(), 50).some((sl) => sl.date === firstOpen.date && sl.start === firstOpen.start)
      s.check('the held slot is no longer offered (capacity respected)', !stillOpen)

      s.group('booking — re-pick replaces (one hold per PI)')
      const second = computeOpenSlots(ruleObj, refs, new Date().toISOString(), 50).find((sl) => !(sl.date === firstOpen.date && sl.start === firstOpen.start))!
      const h2 = await holdBooking({ clientId: TEST_CLIENT, paymentIntentId: piId, gateKind: 'shoot', date: second.date, start: second.start })
      s.check('re-pick to a new slot succeeds', h2.ok === true)
      const { count } = await a.from('bookings').select('id', { count: 'exact', head: true }).eq('stripe_payment_intent_id', piId).eq('status', 'held')
      s.eq('still exactly ONE held booking for the PI', count ?? -1, 1)

      s.group('booking — confirm binds + seeds')
      const confirmed = await confirmBookingForPayment(piId, campaignId!)
      s.check('confirm returns true', confirmed === true)
      const { data: bRow } = await a.from('bookings').select('status, campaign_id, hold_expires_at').eq('stripe_payment_intent_id', piId).eq('status', 'confirmed').maybeSingle()
      s.check('booking is confirmed + bound to the campaign', bRow?.status === 'confirmed' && bRow?.campaign_id === campaignId)
      s.check('hold_expires_at cleared on confirm', bRow?.hold_expires_at == null)
      const { data: campRow } = await a.from('campaigns').select('execution, target_date').eq('id', campaignId).maybeSingle()
      s.check('campaign seeded execution.shootTimes with the real date', typeof (campRow?.execution as Record<string, unknown>)?.shootTimes === 'string')
      s.check('campaign target_date seeded to the shoot date', campRow?.target_date === second.date)
      const readBack = await getConfirmedBookingForCampaign(campaignId!)
      s.check('getConfirmedBookingForCampaign returns the confirmed label', !!readBack && readBack.date === second.date)

      s.group('booking — confirm is idempotent')
      const again = await confirmBookingForPayment(piId, campaignId!)
      s.check('second confirm still true (no-op)', again === true)
      const { count: c2 } = await a.from('bookings').select('id', { count: 'exact', head: true }).eq('stripe_payment_intent_id', piId).eq('status', 'confirmed')
      s.eq('exactly one confirmed booking (no duplicate)', c2 ?? -1, 1)
    }
  } finally {
    if (campaignId) await a.from('campaigns').delete().eq('id', campaignId)   // cascades bookings via campaign_id? no — set null; delete bookings explicitly
    await a.from('bookings').delete().like('stripe_payment_intent_id', `pi_${TAG}_%`)
    if (ruleId) await a.from('availability_rules').delete().eq('id', ruleId)
    await a.from('availability_rules').delete().eq('label', TAG)
    await a.from('campaigns').delete().eq('name', TAG)
  }

  const ok = s.report('Phase 2 — booking-at-checkout')
  process.exit(ok ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
