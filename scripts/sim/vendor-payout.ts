/**
 * Phase 4d verification — G5 marketplace payout rail (DB/engine layer). Drives a creator work order
 * through the real transition machine and proves the money ledger, WITHOUT touching Stripe:
 *   assignment shape → accept → deliver-with-proof GATE → approve → payout ACCRUES (gross/fee/net) →
 *   send is correctly GATED (STRIPE_CONNECT_PAYOUTS off) and status-guarded (accrued, not payable).
 * The actual Connect account + transfer run on the PREVIEW deploy (test keys + flag) — see the runbook.
 *
 * Run:  npx tsx --tsconfig scripts/sim/tsconfig.json scripts/sim/vendor-payout.ts
 */
import { config } from 'dotenv'
import { createAdminClient } from '@/lib/supabase/admin'
import { updateWorkOrder, IllegalTransition } from '@/lib/campaigns/work-orders'
import { sendCreatorPayout, feePercentForCreator } from '@/lib/campaigns/vendor-supply'
import { ensureVendorConnectAccount, getVendorConnectStatus } from '@/lib/campaigns/vendor-connect'
import { Suite } from './lib'

config({ path: '.env.local' })

const TEST_CLIENT = '2535fe50-0d78-411f-a59f-cfffbbd239b5'
const TAG = 'SIM_PAYOUT_DELETE_ME'
const CREATOR = 'sim_vendor_payout'
const GROSS = 20000

async function main() {
  const a = createAdminClient()
  const s = new Suite()
  let campaignId: string | null = null
  let orderId: string | null = null

  try {
    const { data: camp } = await a.from('campaigns').insert({ client_id: TEST_CLIENT, name: TAG, path: 'strategist', status: 'shipped', phase: 'monitor' }).select('id').single()
    campaignId = camp!.id as string
    // A minted-shape order (what assignVendorsToOrderRows produces): concept pre-approved so it can start.
    const { data: o, error: oErr } = await a.from('creator_work_orders').insert({
      campaign_id: campaignId, client_id: TEST_CLIENT, creator_id: CREATOR, discipline: 'Video',
      title: `${TAG} reel`, brief: 'Make the reel.', status: 'offered', amount_cents: GROSS, concept_status: 'approved',
    }).select('id').single()
    s.group('assignment')
    s.check('order minted (offered) with a price + creator', !oErr && !!o?.id, oErr?.message)
    orderId = o!.id as string

    // ── accept → in_progress ──────────────────────────────────────────────────────
    s.group('accept')
    await updateWorkOrder(orderId, { status: 'accepted' })
    await updateWorkOrder(orderId, { status: 'in_progress' })
    const { data: acc } = await a.from('creator_work_orders').select('status').eq('id', orderId).maybeSingle()
    s.check('creator accepted + started (in_progress)', acc?.status === 'in_progress')

    // ── deliver-with-proof GATE ───────────────────────────────────────────────────
    s.group('deliver-with-proof gate')
    let blocked = false
    try { await updateWorkOrder(orderId, { status: 'delivered' }) } catch (e) { blocked = e instanceof IllegalTransition }
    s.check('cannot deliver WITHOUT a delivery link (proof required)', blocked)
    await updateWorkOrder(orderId, { status: 'delivered', delivered_url: 'https://example.com/proof.mp4' })
    const { data: del } = await a.from('creator_work_orders').select('status, delivered_url').eq('id', orderId).maybeSingle()
    s.check('delivered WITH proof link', del?.status === 'delivered' && !!del?.delivered_url)

    // ── approve → payout accrues ──────────────────────────────────────────────────
    s.group('approve → payout accrues on the ledger')
    await updateWorkOrder(orderId, { status: 'approved' })   // triggers accruePayoutForApprovedOrder
    const feePct = await feePercentForCreator(CREATOR)   // a PERCENT (e.g. 20), not a fraction
    const expectedFee = Math.round((GROSS * feePct) / 100)
    const { data: payout } = await a.from('creator_payouts').select('gross_cents, fee_cents, net_cents, status').eq('work_order_id', orderId).maybeSingle()
    s.check('a creator_payouts row was accrued', !!payout, 'no payout row')
    s.eq('gross = the order price', payout?.gross_cents, GROSS)
    s.eq('fee = gross × the vendor take-rate', payout?.fee_cents, expectedFee)
    s.eq('net = gross − fee', payout?.net_cents, GROSS - expectedFee)
    s.eq("status 'accrued' (payable only after the client's invoice is paid)", payout?.status, 'accrued')

    const { data: pid } = await a.from('creator_payouts').select('id').eq('work_order_id', orderId).maybeSingle()
    const payoutId = pid?.id as string

    // ── send is GATED + status-guarded ────────────────────────────────────────────
    s.group('payout send — gated + guarded (no real transfer)')
    const gated = await sendCreatorPayout(payoutId)
    s.check('send refused while STRIPE_CONNECT_PAYOUTS is off', gated.ok === false, JSON.stringify(gated))
    s.check('the refusal names the flag (never a silent transfer)', !gated.ok && /connect payouts are not enabled/i.test(gated.error))

    // ── Connect onboarding — flag off → honest refusal, status read never throws ──
    s.group('Connect onboarding (flag off)')
    const onboard = await ensureVendorConnectAccount('00000000-0000-0000-0000-000000000000')
    s.check('onboarding refused without the flag (never creates a real account)', onboard.ok === false)
    const status = await getVendorConnectStatus('00000000-0000-0000-0000-000000000000')
    s.check('connect status read is safe (no account, no throw)', status.hasAccount === false && status.payoutsEnabled === false)
  } finally {
    if (orderId) await a.from('creator_payouts').delete().eq('work_order_id', orderId)
    if (campaignId) { await a.from('creator_work_orders').delete().eq('campaign_id', campaignId); await a.from('campaigns').delete().eq('id', campaignId) }
    await a.from('campaigns').delete().eq('name', TAG)
  }

  const ok = s.report('Phase 4d — G5 marketplace payout rail (DB/engine)')
  process.exit(ok ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
