/**
 * Phase 0 money-guard verification (G1 double-billing + G7 payment-aware ship).
 *
 * Drives the REAL campaign_charges / campaign_payments / creator_work_orders tables with the
 * service-role client, self-cleaning off two throwaway campaigns. No Stripe calls are made
 * (all payment rows are seeded 'paid'); no live billing is touched.
 *
 * Run:  npx tsx scripts/sim/phase0-money-guard.ts
 *
 * NOTE ON MIGRATION 217: the covered-status CHECK widening is applied by the OWNER in Supabase.
 * This script asserts the SAFETY INVARIANT that holds either way — a checkout-paid campaign
 * never leaves an invoiceable 'accrued' charge — and reports which branch (covered row present,
 * or row-skipped pre-217) it observed.
 */
import { config } from 'dotenv'
import { createAdminClient } from '@/lib/supabase/admin'
import { accrueChargeForApprovedOrder } from '@/lib/campaigns/work-orders'
import { verifyAndLinkCheckoutPayment } from '@/lib/campaigns/checkout-server'
import { checkoutBill } from '@/lib/campaigns/checkout-bill'
import type { LineItem } from '@/lib/campaigns/types'
import { Suite } from './lib'

config({ path: '.env.local' })

const TEST_CLIENT = '2535fe50-0d78-411f-a59f-cfffbbd239b5'
const OTHER_CLIENT = '00000000-0000-0000-0000-000000000001' // a bogus id for the wrong-tenant check
const TAG = 'SIM_PHASE0_DELETE_ME'

function billableLine(cents: number): LineItem {
  return {
    id: 'li-x', serviceId: 'content-reel', name: 'Reel', plain: 'Reel', does: 'a reel',
    stage: 'foundation', price: cents / 100, cadence: { kind: 'one-time' }, eta: '~1 week',
    included: true, lock: 'editable',
  }
}

async function seedApprovedOrder(a: ReturnType<typeof createAdminClient>, campaignId: string, amountCents: number): Promise<string> {
  const { data } = await a.from('creator_work_orders')
    .insert({ campaign_id: campaignId, client_id: TEST_CLIENT, creator_id: 'sim_video', discipline: 'Video', title: `${TAG} order`, brief: 'x', status: 'approved', amount_cents: amountCents })
    .select('id').single()
  return data!.id as string
}

async function main() {
  const a = createAdminClient()
  const s = new Suite()

  // cleanup any leftovers
  await a.from('campaigns').delete().eq('name', TAG)
  await a.from('campaign_payments').delete().eq('client_id', TEST_CLIENT).eq('draft->>name', TAG)

  // ── two throwaway campaigns: one paid-at-checkout, one delivery-gated ──────────
  const { data: paidCamp } = await a.from('campaigns').insert({ client_id: TEST_CLIENT, name: TAG, path: 'ai', status: 'shipped', phase: 'monitor' }).select('id').single()
  const { data: gatedCamp } = await a.from('campaigns').insert({ client_id: TEST_CLIENT, name: TAG, path: 'ai', status: 'shipped', phase: 'monitor' }).select('id').single()
  const paidId = paidCamp!.id as string
  const gatedId = gatedCamp!.id as string

  // a PAID checkout payment row for the first campaign only
  const piId = `pi_${TAG}_${Date.now()}`
  await a.from('campaign_payments').insert({
    client_id: TEST_CLIENT, campaign_id: paidId, stripe_payment_intent_id: piId, stripe_customer_id: 'cus_sim',
    subtotal_cents: 10000, service_fee_cents: 1000, tax_cents: 0, total_cents: 11000, status: 'paid', paid_at: new Date().toISOString(),
  })

  try {
    // ═══ G1: checkout-paid campaign never leaves an invoiceable charge ═══════════
    s.group('G1 — covered campaign')
    const oPaid = await seedApprovedOrder(a, paidId, 7000)
    const okPaid = await accrueChargeForApprovedOrder(oPaid)
    s.check('accrue returns handled=true for covered order', okPaid === true)
    const { data: paidCharges } = await a.from('campaign_charges').select('status, amount_cents').eq('campaign_id', paidId)
    const accruedForPaid = (paidCharges ?? []).filter((c) => c.status === 'accrued')
    const coveredForPaid = (paidCharges ?? []).filter((c) => c.status === 'covered_by_checkout')
    s.eq('ZERO invoiceable (accrued) charges on the paid campaign', accruedForPaid.length, 0)
    s.check('ledger branch observed', true, coveredForPaid.length ? `covered row present (migration 217 applied)` : `row skipped (pre-217) — safe either way`)

    // the invoicing query (status='accrued') must find nothing for this client's paid campaign
    const { data: invoiceable } = await a.from('campaign_charges').select('id').eq('campaign_id', paidId).eq('status', 'accrued').gt('amount_cents', 0)
    s.eq('invoicing query finds nothing to bill on the paid campaign', invoiceable?.length ?? 0, 0)

    // ═══ G1 control: delivery-gated campaign still accrues normally ══════════════
    s.group('G1 — control (delivery-gated still bills)')
    const oGated = await seedApprovedOrder(a, gatedId, 5000)
    const okGated = await accrueChargeForApprovedOrder(oGated)
    s.check('accrue returns true for gated order', okGated === true)
    const { data: gatedCharges } = await a.from('campaign_charges').select('status, amount_cents').eq('campaign_id', gatedId)
    const accruedForGated = (gatedCharges ?? []).filter((c) => c.status === 'accrued')
    s.eq('gated campaign has exactly one accrued charge', accruedForGated.length, 1)
    s.eq('accrued amount is the order price', accruedForGated[0]?.amount_cents, 5000)

    // ═══ G7: payment-aware ship verification (no Stripe; seeded paid row) ═════════
    s.group('G7 — bill computation')
    s.eq('billable draft has preTaxCents > 0', checkoutBill({ items: [billableLine(10000)] }).preTaxCents, 11000)
    s.eq('$0 / DIY draft has preTaxCents == 0 (ship allowed without payment)', checkoutBill({ items: [] }).preTaxCents, 0)

    s.group('G7 — verifyAndLinkCheckoutPayment')
    const good = await verifyAndLinkCheckoutPayment({ paymentIntentId: piId, clientId: TEST_CLIENT, campaignId: paidId, preTaxCents: 11000 })
    s.check('paid + covering + same tenant → ok', good.ok === true, good.ok ? undefined : good.reason)
    const wrongTenant = await verifyAndLinkCheckoutPayment({ paymentIntentId: piId, clientId: OTHER_CLIENT, campaignId: paidId, preTaxCents: 11000 })
    s.check('wrong tenant → refused', wrongTenant.ok === false)
    const missing = await verifyAndLinkCheckoutPayment({ paymentIntentId: `pi_nope_${Date.now()}`, clientId: TEST_CLIENT, campaignId: paidId, preTaxCents: 11000 })
    s.check('no payment row → refused', missing.ok === false)
    const underpaid = await verifyAndLinkCheckoutPayment({ paymentIntentId: piId, clientId: TEST_CLIENT, campaignId: paidId, preTaxCents: 999999 })
    s.check('amount does not cover the bill → refused', underpaid.ok === false)
  } finally {
    await a.from('campaigns').delete().eq('name', TAG)               // cascades charges + orders
    await a.from('campaign_payments').delete().eq('stripe_payment_intent_id', `pi_${TAG}`)
    await a.from('campaign_payments').delete().eq('client_id', TEST_CLIENT).eq('campaign_id', null).eq('draft->>name', TAG)
    await a.from('campaign_payments').delete().like('stripe_payment_intent_id', `pi_${TAG}_%`)
  }

  const ok = s.report('Phase 0 money-guard (G1 + G7)')
  process.exit(ok ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
