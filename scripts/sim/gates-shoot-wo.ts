/**
 * Live e2e — confirm-booking seeds a real shoot service_work_order's due_date (the one path the main
 * booking sim skips, since its throwaway campaign mints no work orders). Also asserts the full seed:
 * booking confirmed+bound, execution.shootTimes, target_date, and the confirmed-read. Requires 218 +
 * 190 live. Self-cleaning.
 *
 * Run:  npx tsx --tsconfig scripts/sim/tsconfig.json scripts/sim/gates-shoot-wo.ts
 */
import { config } from 'dotenv'
import { createAdminClient } from '@/lib/supabase/admin'
import { holdBooking, confirmBookingForPayment, getConfirmedBookingForCampaign } from '@/lib/campaigns/gates/booking-server'
import { computeOpenSlots } from '@/lib/campaigns/gates/availability'
import type { AvailabilityRule } from '@/lib/campaigns/gates/types'
import { Suite } from './lib'

config({ path: '.env.local' })

const TEST_CLIENT = '2535fe50-0d78-411f-a59f-cfffbbd239b5'
const TAG = 'SIM_SHOOTWO_DELETE_ME'

async function main() {
  const a = createAdminClient()
  const s = new Suite()
  const piId = `pi_${TAG}_${Date.now()}`
  let ruleId: string | null = null
  let campaignId: string | null = null

  try {
    await a.from('availability_rules').delete().eq('label', TAG)
    const wk = { start: '09:00', end: '17:00' }
    const { data: rule, error: rErr } = await a.from('availability_rules').insert({
      gate_kind: 'shoot', scope_kind: 'team', label: TAG, timezone: 'America/Los_Angeles',
      weekly: { '1': [wk], '2': [wk], '3': [wk], '4': [wk], '5': [wk] }, exceptions: {},
      slot_minutes: 120, capacity: 1, lead_time_days: 3, horizon_days: 30, active: true,
    }).select('*').single()
    s.group('setup')
    s.check('availability rule published', !rErr && !!rule, rErr?.message)
    if (!rule) { s.report('shoot WO due-date seed'); process.exit(1) }
    ruleId = rule.id as string

    const { data: camp } = await a.from('campaigns').insert({ client_id: TEST_CLIENT, name: TAG, path: 'strategist', status: 'shipped', phase: 'monitor' }).select('id').single()
    campaignId = camp!.id as string

    // A real shoot service work order (video-engine is class 'creative' + needsShoot). Give it a
    // deliberately WRONG due_date so we can prove confirm re-points it at the booked date.
    const { error: woErr } = await a.from('service_work_orders').insert({
      campaign_id: campaignId, client_id: TEST_CLIENT, service_id: 'video-engine', title: `${TAG} shoot`,
      status: 'queued', due_date: '2020-01-01', steps: [],
    })
    s.check('seeded a shoot service work order', !woErr, woErr?.message)
    // A non-shoot WO that must NOT be touched.
    await a.from('service_work_orders').insert({ campaign_id: campaignId, client_id: TEST_CLIENT, service_id: 'gbp-setup', title: `${TAG} gbp`, status: 'queued', due_date: '2020-01-01', steps: [] })

    const ruleObj: AvailabilityRule = { id: ruleId, gateKind: 'shoot', scopeKind: 'team', scopeId: null, label: TAG, timezone: 'America/Los_Angeles', weekly: rule.weekly, exceptions: {}, slotMinutes: 120, capacity: 1, leadTimeDays: 3, horizonDays: 30, active: true }
    const slot = computeOpenSlots(ruleObj, [], new Date().toISOString(), 5)[0]

    s.group('hold + confirm')
    const h = await holdBooking({ clientId: TEST_CLIENT, paymentIntentId: piId, gateKind: 'shoot', date: slot.date, start: slot.start })
    s.check('hold succeeds', h.ok === true, h.ok ? undefined : h.error)
    const confirmed = await confirmBookingForPayment(piId, campaignId)
    s.check('confirm returns true', confirmed === true)

    s.group('seeding')
    const { data: wos } = await a.from('service_work_orders').select('service_id, due_date').eq('campaign_id', campaignId)
    const shootWo = (wos ?? []).find((w) => w.service_id === 'video-engine')
    const gbpWo = (wos ?? []).find((w) => w.service_id === 'gbp-setup')
    s.check('shoot WO due_date re-pointed to the booked date', shootWo?.due_date === slot.date, `got ${shootWo?.due_date}, want ${slot.date}`)
    s.check('non-shoot WO due_date left untouched', gbpWo?.due_date === '2020-01-01')
    const { data: campRow } = await a.from('campaigns').select('execution, target_date').eq('id', campaignId).maybeSingle()
    s.check('execution.shootTimes seeded', typeof (campRow?.execution as Record<string, unknown>)?.shootTimes === 'string')
    s.check('target_date seeded to booked date', campRow?.target_date === slot.date)
    const read = await getConfirmedBookingForCampaign(campaignId)
    s.check('confirmed-booking read returns the label', !!read && read.date === slot.date && read.label.length > 0)
  } finally {
    if (campaignId) await a.from('service_work_orders').delete().eq('campaign_id', campaignId)
    await a.from('bookings').delete().like('stripe_payment_intent_id', `pi_${TAG}_%`)
    if (campaignId) await a.from('campaigns').delete().eq('id', campaignId)
    if (ruleId) await a.from('availability_rules').delete().eq('id', ruleId)
    await a.from('availability_rules').delete().eq('label', TAG)
    await a.from('campaigns').delete().eq('name', TAG)
  }

  const ok = s.report('Live — confirm seeds shoot WO due_date + campaign date')
  process.exit(ok ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
