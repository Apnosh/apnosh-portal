/**
 * Phase 4c verification — G4 auto-subscription. Proves the money-safe logic WITHOUT touching live
 * billing (no Stripe secret key locally): the monthly amount computed from the paid snapshot, the
 * idempotent short-circuit, the no-recurring no-op, and the pre-221 degradation. The ACTUAL Stripe
 * subscription creation (charge_automatically from the saved card) runs on the PREVIEW deploy that
 * has the TEST keys — flagged below, not faked here.
 *
 * Run:  npx tsx --tsconfig scripts/sim/tsconfig.json scripts/sim/campaign-subscription.ts
 */
import { config } from 'dotenv'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkoutBill } from '@/lib/campaigns/checkout-bill'
import { ensureCampaignSubscription } from '@/lib/campaigns/campaign-subscription-server'
import type { CampaignDraft, LineItem } from '@/lib/campaigns/types'
import { Suite } from './lib'

config({ path: '.env.local' })

const TEST_CLIENT = '2535fe50-0d78-411f-a59f-cfffbbd239b5'
const TAG = 'SIM_SUB_DELETE_ME'

const line = (over: Partial<LineItem>): LineItem => ({ id: 'li', serviceId: 'x', name: 'x', plain: 'x', does: '', stage: 'foundation', price: 0, cadence: { kind: 'one-time' }, eta: '', included: true, lock: 'editable', ...over })
const monthlyDraft = (): CampaignDraft => ({ id: 'new', name: TAG, intent: 'ongoing', path: 'strategist', budgetMonthly: 200, items: [line({ id: 'a', price: 300, cadence: { kind: 'one-time' } }), line({ id: 'b', price: 200, cadence: { kind: 'recurring', every: 'monthly' } })] })
const oneTimeOnlyDraft = (): CampaignDraft => ({ id: 'new', name: TAG, intent: 'one-off', path: 'strategist', budgetMonthly: 0, items: [line({ id: 'a', price: 300, cadence: { kind: 'one-time' } })] })

async function has221(a: ReturnType<typeof createAdminClient>): Promise<boolean> {
  const { error } = await a.from('campaign_payments').select('stripe_subscription_id').limit(1)
  return !error
}

async function seedPayment(a: ReturnType<typeof createAdminClient>, pi: string, draft: CampaignDraft, extra: Record<string, unknown> = {}) {
  await a.from('campaign_payments').insert({
    client_id: TEST_CLIENT, stripe_payment_intent_id: pi, stripe_customer_id: 'cus_sim',
    subtotal_cents: 30000, service_fee_cents: 3000, tax_cents: 0, total_cents: 33000, status: 'paid', draft, ...extra,
  })
}

async function main() {
  const a = createAdminClient()
  const s = new Suite()

  // ── pure: the monthly amount that would be subscribed ────────────────────────────
  s.group('monthly amount (from the paid snapshot)')
  s.eq('a plan with a $200/mo line → perMonthCents 20000', checkoutBill(monthlyDraft()).perMonthCents, 20000)
  s.eq('a one-time-only plan → perMonthCents 0 (nothing to subscribe)', checkoutBill(oneTimeOnlyDraft()).perMonthCents, 0)

  const applied = await has221(a)
  s.group('migration 221 state')
  s.check('detected campaign_payments subscription columns', true, applied ? '221 APPLIED — running idempotency + no-op paths' : '221 NOT applied — asserting degradation')

  try {
    if (!applied) {
      s.group('degradation (pre-221)')
      const pi = `pi_${TAG}_${Date.now()}`
      await seedPayment(a, pi, monthlyDraft())
      const r = await ensureCampaignSubscription(pi, '00000000-0000-0000-0000-000000000000')
      s.check('ensureCampaignSubscription degrades to a clean no-op (no crash, no Stripe)', r.ok === true && r.status === 'none', JSON.stringify(r))
    } else {
      s.group('idempotency — already-subscribed short-circuits (no Stripe call)')
      const pi1 = `pi_${TAG}_a_${Date.now()}`
      await seedPayment(a, pi1, monthlyDraft(), { stripe_subscription_id: 'sub_existing', subscription_status: 'active' })
      const r1 = await ensureCampaignSubscription(pi1, '00000000-0000-0000-0000-000000000000')
      s.check("returns 'already' with the existing subscription id (never a 2nd sub)", r1.ok && r1.status === 'already' && r1.subscriptionId === 'sub_existing', JSON.stringify(r1))

      s.group('no recurring lines → nothing to start (no Stripe call)')
      const pi2 = `pi_${TAG}_b_${Date.now()}`
      await seedPayment(a, pi2, oneTimeOnlyDraft())
      const r2 = await ensureCampaignSubscription(pi2, '00000000-0000-0000-0000-000000000000')
      s.check("returns 'none'", r2.ok && r2.status === 'none', JSON.stringify(r2))
      const { data: row2 } = await a.from('campaign_payments').select('subscription_status').eq('stripe_payment_intent_id', pi2).maybeSingle()
      s.check("stamps subscription_status 'none' on the row", (row2 as { subscription_status?: string } | null)?.subscription_status === 'none')
    }
  } finally {
    await a.from('campaign_payments').delete().like('stripe_payment_intent_id', `pi_${TAG}_%`)
  }

  const ok = s.report('Phase 4c — G4 auto-subscription (logic; Stripe creation runs on preview)')
  process.exit(ok ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
