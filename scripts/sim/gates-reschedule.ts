/**
 * Phase 3 verification — reschedule + request-mode, against the LIVE tables.
 *   A) self-reschedule window (pure).
 *   B) admin needs_reschedule → blocks shoot WO + owner-picks; assign → confirmed + unblock + reseed.
 *   C) client self-reschedule: far-out slot self-moves; within-3-biz-days routes to staff.
 *   D) request-mode ('requested'): needs migration 219 — branches to the graceful path if not applied.
 *
 * Run:  npx tsx --tsconfig scripts/sim/tsconfig.json scripts/sim/gates-reschedule.ts
 */
import { config } from 'dotenv'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  withinSelfRescheduleWindow, adminSetNeedsReschedule, assignBookingSlot, clientReschedule,
  requestBooking, confirmBookingForPayment, getBookingForCampaign,
} from '@/lib/campaigns/gates/booking-server'
import { computeOpenSlots, addBusinessDays } from '@/lib/campaigns/gates/availability'
import type { AvailabilityRule } from '@/lib/campaigns/gates/types'
import { Suite } from './lib'

config({ path: '.env.local' })

const TEST_CLIENT = '2535fe50-0d78-411f-a59f-cfffbbd239b5'
const TAG = 'SIM_RESCHED_DELETE_ME'
const wk = { start: '09:00', end: '17:00' }

async function main() {
  const a = createAdminClient()
  const s = new Suite()
  const now = new Date().toISOString()

  // ── A) pure window ──────────────────────────────────────────────────────────────
  s.group('self-reschedule window (pure)')
  s.check('a slot 20 days out is self-reschedulable', withinSelfRescheduleWindow(addBusinessDays(now.slice(0, 10), 20), now))
  s.check('tomorrow is NOT self-reschedulable (inside 3 biz days)', !withinSelfRescheduleWindow(new Date(Date.parse(now) + 86400000).toISOString().slice(0, 10), now))

  let ruleId: string | null = null
  const made: string[] = []   // campaign ids to clean
  try {
    await a.from('availability_rules').delete().eq('label', TAG)
    const { data: rule, error: rErr } = await a.from('availability_rules').insert({
      gate_kind: 'shoot', scope_kind: 'team', label: TAG, timezone: 'America/Los_Angeles',
      weekly: { '1': [wk], '2': [wk], '3': [wk], '4': [wk], '5': [wk] }, exceptions: {},
      slot_minutes: 120, capacity: 5, lead_time_days: 1, horizon_days: 45, active: true,
    }).select('*').single()
    s.group('setup'); s.check('rule published', !rErr && !!rule, rErr?.message)
    if (!rule) { s.report('Phase 3 — reschedule'); process.exit(1) }
    ruleId = rule.id as string
    const ruleObj: AvailabilityRule = { id: ruleId, gateKind: 'shoot', scopeKind: 'team', scopeId: null, label: TAG, timezone: 'America/Los_Angeles', weekly: rule.weekly, exceptions: {}, slotMinutes: 120, capacity: 5, leadTimeDays: 1, horizonDays: 45, active: true }
    const openSlots = computeOpenSlots(ruleObj, [], now, 400)
    const farSlot = openSlots.find((sl) => withinSelfRescheduleWindow(sl.date, now))!

    // helper: a shipped campaign with a shoot WO + a directly-seeded CONFIRMED booking on `slotDate`.
    const seedConfirmed = async (slotDate: string, start: string): Promise<{ campaignId: string; bookingId: string }> => {
      const { data: camp } = await a.from('campaigns').insert({ client_id: TEST_CLIENT, name: TAG, path: 'strategist', status: 'shipped', phase: 'monitor' }).select('id').single()
      const campaignId = camp!.id as string; made.push(campaignId)
      await a.from('service_work_orders').insert({ campaign_id: campaignId, client_id: TEST_CLIENT, service_id: 'video-engine', title: `${TAG} shoot`, status: 'queued', due_date: slotDate, steps: [] })
      const { data: b } = await a.from('bookings').insert({ client_id: TEST_CLIENT, gate_kind: 'shoot', rule_id: ruleId, slot_date: slotDate, slot_start: start, slot_end: '11:00', timezone: 'America/Los_Angeles', status: 'confirmed', campaign_id: campaignId }).select('id').single()
      return { campaignId, bookingId: b!.id as string }
    }

    // ── B) admin needs_reschedule → assign ────────────────────────────────────────
    s.group('admin: needs_reschedule blocks the shoot WO')
    const B = await seedConfirmed(farSlot.date, farSlot.start)
    const nr = await adminSetNeedsReschedule(B.bookingId, 'Photographer double-booked')
    s.check('adminSetNeedsReschedule ok', nr.ok === true, nr.error)
    const bAfter = await getBookingForCampaign(B.campaignId)
    s.check('booking is needs_reschedule', bAfter?.status === 'needs_reschedule')
    s.check('needs_reschedule is always self-reschedulable', bAfter?.canSelfReschedule === true)
    const { data: woBlocked } = await a.from('service_work_orders').select('status, blocked_reason').eq('campaign_id', B.campaignId).maybeSingle()
    s.check('shoot WO blocked_client with the reason', woBlocked?.status === 'blocked_client' && (woBlocked?.blocked_reason ?? '').length > 0)

    s.group('admin: assign a new slot → confirmed + unblock + reseed')
    const other = computeOpenSlots(ruleObj, [], now, 400).find((sl) => !(sl.date === farSlot.date && sl.start === farSlot.start))!
    const asg = await assignBookingSlot({ bookingId: B.bookingId, date: other.date, start: other.start, notify: 'client' })
    s.check('assign ok', asg.ok === true, asg.ok ? undefined : asg.error)
    const bAssigned = await getBookingForCampaign(B.campaignId)
    s.check('booking confirmed on the new slot', bAssigned?.status === 'confirmed' && bAssigned?.date === other.date)
    const { data: woUnblocked } = await a.from('service_work_orders').select('status, due_date').eq('campaign_id', B.campaignId).maybeSingle()
    s.check('shoot WO unblocked (queued) + re-dated', woUnblocked?.status === 'queued' && woUnblocked?.due_date === other.date)
    const { data: campReseed } = await a.from('campaigns').select('target_date').eq('id', B.campaignId).maybeSingle()
    s.check('campaign target_date reseeded', campReseed?.target_date === other.date)

    // ── C) client self-reschedule ─────────────────────────────────────────────────
    s.group('client: far-out slot self-moves')
    const C = await seedConfirmed(farSlot.date, farSlot.start)
    const dest = computeOpenSlots(ruleObj, [], now, 400).find((sl) => sl.date !== farSlot.date)!
    const cr = await clientReschedule({ bookingId: C.bookingId, clientId: TEST_CLIENT, date: dest.date, start: dest.start })
    s.check('self-reschedule ok', cr.ok === true, cr.ok ? undefined : (cr as { error: string }).error)
    s.check('moved to the chosen slot', (await getBookingForCampaign(C.campaignId))?.date === dest.date)

    s.group('client: within 3 biz days → routes to staff')
    const near = new Date(Date.parse(now) + 2 * 86400000).toISOString().slice(0, 10)   // ~2 days out
    const D = await seedConfirmed(near, '09:00')
    const cr2 = await clientReschedule({ bookingId: D.bookingId, clientId: TEST_CLIENT, date: farSlot.date, start: farSlot.start })
    s.check('self-reschedule refused with needs_staff', cr2.ok === false && (cr2 as { code: string }).code === 'needs_staff')
    s.check('booking unchanged (still confirmed on the near date)', (await getBookingForCampaign(D.campaignId))?.date === near)
    s.group('client: tenancy guard')
    const cr3 = await clientReschedule({ bookingId: D.bookingId, clientId: '00000000-0000-0000-0000-000000000001', date: dest.date, start: dest.start })
    s.check('a different tenant is forbidden', cr3.ok === false && (cr3 as { code: string }).code === 'forbidden')

    // ── D) request-mode ('requested') — needs migration 219 ───────────────────────
    s.group('request-mode (migration 219)')
    const piReq = `pi_${TAG}_req_${Date.now()}`
    const req = await requestBooking({ clientId: TEST_CLIENT, paymentIntentId: piReq, gateKind: 'shoot' })
    if (req.ok) {
      s.check('219 applied — requested booking created', true, 'running full request-mode path')
      const { data: reqRow } = await a.from('bookings').select('id, status').eq('stripe_payment_intent_id', piReq).maybeSingle()
      s.check('a requested (dateless) booking exists', reqRow?.status === 'requested')
      const { data: camp } = await a.from('campaigns').insert({ client_id: TEST_CLIENT, name: TAG, path: 'strategist', status: 'shipped', phase: 'monitor' }).select('id').single()
      made.push(camp!.id as string)
      const bound = await confirmBookingForPayment(piReq, camp!.id as string)
      s.check('confirm binds the requested booking (stays requested, no fake date)', bound === true)
      const view = await getBookingForCampaign(camp!.id as string)
      s.check('tracker shows request-mode with NO date', view?.status === 'requested' && view?.date === null)
      await a.from('bookings').delete().eq('stripe_payment_intent_id', piReq)
    } else {
      s.check('219 NOT applied — request-mode degrades to setup (honest note, no row)', req.code === 'setup', `code=${req.code}`)
    }
  } finally {
    await a.from('bookings').delete().like('stripe_payment_intent_id', `pi_${TAG}_%`)
    for (const cid of made) { await a.from('service_work_orders').delete().eq('campaign_id', cid); await a.from('bookings').delete().eq('campaign_id', cid); await a.from('campaigns').delete().eq('id', cid) }
    if (ruleId) await a.from('bookings').delete().eq('rule_id', ruleId)
    await a.from('availability_rules').delete().eq('label', TAG)
    await a.from('campaigns').delete().eq('name', TAG)
  }

  const ok = s.report('Phase 3 — reschedule + request-mode')
  process.exit(ok ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
