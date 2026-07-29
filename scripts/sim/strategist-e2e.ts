/**
 * THE HEADLESS STRATEGIST SPINE — describe → compose → route → bill → create → ship → mint,
 * driven end to end against the REAL database (Phase 4 of the plan of record).
 *
 * What only this sim proves: LAW 4 END TO END. Nothing else anywhere asserts a plan_allocations
 * row — that the compose half writes at create, that ship stamps final_items/choices without
 * touching `composed`, and that signals provenance is never laundered mint→compose. The chain
 * itself has also never been driven whole: create→ship→mint each had partial coverage, never
 * the sequence.
 *
 * The ship is the $0 owner-run path (gbp card, "I'll do it myself") — shipBillingGate ALLOWS
 * free work, so no Stripe is needed. The billable branch is asserted as a REFUSAL: a headless
 * script cannot ship unpaid billable work, and that is the money honesty, not an obstacle.
 *
 * Self-cleaning, incl. the two ON DELETE SET NULL tables (plan_allocations, content_drafts)
 * that would otherwise orphan rather than cascade.
 *
 * Run: npx tsx --tsconfig scripts/sim/tsconfig.json scripts/sim/strategist-e2e.ts
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import { createAdminClient } from '@/lib/supabase/admin'
import { matchSituation } from '@/lib/campaigns/data/plan-goals'
import { draftFromBuilder } from '@/lib/campaigns/builder/adapter'
import { routeForItem, routeViolations } from '@/lib/campaigns/builder/routing'
import { checkoutBill } from '@/lib/campaigns/checkout-bill'
import { shipBillingGate } from '@/lib/campaigns/ship-guard'
import { createCampaign, getCampaign, updateCampaignFields, materializeCampaignDrafts } from '@/lib/campaigns/server'
import { mintServiceWorkOrders } from '@/lib/campaigns/service-work-orders'
import { recordComposeAllocation, finalizeAllocation } from '@/lib/campaigns/allocation-record'
import type { CampaignDraft } from '@/lib/campaigns/types'
import { Suite } from './lib'

const TEST_CLIENT = '2535fe50-0d78-411f-a59f-cfffbbd239b5'
const TEST_NAME = 'SIM_STRATEGIST_DELETE_ME'

async function main() {
  const a = createAdminClient()
  const s = new Suite()

  const cleanup = async (campaignId?: string) => {
    // plan_allocations + content_drafts are ON DELETE SET NULL — clean them BEFORE the campaign
    // delete or they orphan with campaign_id null.
    if (campaignId) {
      await a.from('plan_allocations').delete().eq('campaign_id', campaignId)
      await a.from('content_drafts').delete().eq('campaign_id', campaignId)
    }
    const { data: leftovers } = await a.from('campaigns').select('id').eq('name', TEST_NAME)
    for (const row of leftovers ?? []) {
      await a.from('plan_allocations').delete().eq('campaign_id', row.id as string)
      await a.from('content_drafts').delete().eq('campaign_id', row.id as string)
    }
    await a.from('campaigns').delete().eq('name', TEST_NAME)
  }
  await cleanup()

  let campaignId = ''
  try {
    /* ── 1. DESCRIBE: the deterministic floor, zero AI ─────────────────────────────────── */
    s.group('describe: the pure floor matches, and refuses to guess')
    {
      const hit = matchSituation('we are having our grand opening next month and want a line out the door')
      s.check('a grand-opening sentence matches the opening situation', hit?.situation.v === 'opening' || hit?.situation.goal === 'opening')
      s.check('the situation carries its goal and shape', !!hit?.situation.goal && !!hit?.situation.shape)
      const miss = matchSituation('help')
      s.check('an ambiguous sentence returns null, never a guess', miss === null)
    }

    /* ── 2. COMPOSE + ROUTE: the $0 owner-run draft, with a real compose snapshot ─────── */
    s.group('compose + route: the diy draft is route-clean and carries the snapshot')
    const SNAPSHOT = { signals: { rating: 4.1, hasList: false, richness: 4 }, route: 'tailored', at: '2026-07-28T12:00:00Z' }
    const draft = draftFromBuilder({ itemId: 'gbp', status: 'approve', vals: { doer: "I'll do it myself", allocSnapshot: SNAPSHOT } })
    draft.name = TEST_NAME
    {
      s.check('the adapter stamped the compose allocation (law 4, compose half)',
        Array.isArray(draft.allocation?.composed) && draft.allocation!.composed.length > 0 && draft.allocation?.signals != null)
      const diyLines = draft.items.filter((it) => it.producer === 'diy')
      s.check(`the doer routed the gbp work owner-run (${diyLines.length} diy lines, all $0)`,
        diyLines.length > 0 && diyLines.every((it) => it.price === 0))
      let clean = true
      for (const it of draft.items) if (routeViolations(it, routeForItem(it)).length > 0) clean = false
      s.check('every composed line routes with zero violations', clean)
    }

    /* ── 3. BILL: both honesty branches of the gate ────────────────────────────────────── */
    s.group('the billing gate: free ships, unpaid billable refuses')
    {
      // Ship only the owner-run work — the legitimate owner edit (drop what you won't buy).
      draft.items = draft.items.filter((it) => it.producer === 'diy' || it.serviceable === false)
      const bill = checkoutBill(draft)
      s.check(`the diy cart is genuinely $0 (${bill.preTaxCents}¢ + ${bill.perMonthCents}¢/mo)`, bill.preTaxCents === 0 && bill.perMonthCents === 0)
      s.check('a $0 cart may ship without Stripe', shipBillingGate({ preTaxCents: 0, perMonthCents: 0, hasPaymentIntent: false, createdAtISO: '2026-07-28' }) === 'allow')
      s.check('an unpaid billable cart is REFUSED headlessly (the money honesty)',
        shipBillingGate({ preTaxCents: 50_000, perMonthCents: 0, hasPaymentIntent: false, createdAtISO: '2026-07-28' }) === 'refuse')
      s.check('the same cart with a PaymentIntent goes to verify, never straight through',
        shipBillingGate({ preTaxCents: 50_000, perMonthCents: 0, hasPaymentIntent: true, createdAtISO: '2026-07-28' }) === 'verify')
    }

    /* ── 4. CREATE: the campaign + the allocation record's compose half ────────────────── */
    s.group('create: the allocation record opens with the composed truth')
    {
      campaignId = await createCampaign(TEST_CLIENT, null, draft as CampaignDraft)
      s.check('createCampaign returned an id', !!campaignId)
      await recordComposeAllocation(campaignId, TEST_CLIENT, draft as CampaignDraft)
      const { data: rows } = await a.from('plan_allocations').select('*').eq('campaign_id', campaignId)
      s.check('exactly one allocation row exists', rows?.length === 1)
      const row = rows?.[0] as Record<string, unknown> | undefined
      s.check('composed = the pre-edit plan', Array.isArray(row?.composed) && (row!.composed as unknown[]).length === draft.allocation!.composed.length)
      s.check("signals_at is 'compose' (a genuine compose-time snapshot rode the draft)", row?.signals_at === 'compose')
      s.check('the signals the strategist saw are on the row', JSON.stringify(row?.signals) === JSON.stringify(SNAPSHOT.signals))
      s.check('choices open empty', JSON.stringify(row?.choices) === '{}')
    }

    /* ── 5. SHIP: the one-shot claim + the route's post-ship order ─────────────────────── */
    s.group('ship: claimed once, finalized honestly, minted correctly')
    {
      const shipISO = new Date().toISOString()
      const first = await updateCampaignFields(campaignId, { status: 'shipped' }, { onlyIfNotShipped: true })
      s.check('the ship claim applies once', first === true)
      const second = await updateCampaignFields(campaignId, { status: 'shipped' }, { onlyIfNotShipped: true })
      s.check('a second ship claim is refused (one-shot)', second === false)

      const campaign = await getCampaign(campaignId)
      s.check('the campaign reads back shipped', campaign?.status === 'shipped')
      if (!campaign) throw new Error('campaign vanished')

      await finalizeAllocation({
        campaignId, clientId: TEST_CLIENT,
        goal: campaign.draft.goalKey ?? campaign.draft.sourceCatalogId ?? 'unknown',
        finalItems: campaign.draft.items, choices: campaign.producerChoices ?? {},
      })
      const materialized = await materializeCampaignDrafts(campaign, shipISO)
      const mint = await mintServiceWorkOrders(campaign, shipISO)

      // The whole record, after the whole chain.
      const { data: rows } = await a.from('plan_allocations').select('*').eq('campaign_id', campaignId)
      s.check('STILL exactly one allocation row (finalize updates, never duplicates)', rows?.length === 1)
      const row = rows?.[0] as Record<string, unknown>
      s.check('composed is UNCHANGED by ship (the disagreement half survives)',
        Array.isArray(row.composed) && (row.composed as unknown[]).length === draft.allocation!.composed.length)
      s.check('final_items stamped with what actually shipped',
        Array.isArray(row.final_items) && (row.final_items as unknown[]).length === campaign.draft.items.length)
      s.check("signals_at was never laundered to 'mint'", row.signals_at === 'compose')

      // diy lines mint ZERO staff work — the guide/owner rail honored through the real writer.
      const { count: woCount } = await a.from('service_work_orders').select('id', { count: 'exact', head: true }).eq('campaign_id', campaignId)
      s.check(`an all-diy ship mints zero service work orders (minted ${mint.minted}, rows ${woCount ?? 0})`,
        mint.minted === 0 && (woCount ?? 0) === 0)
      s.check(`and materializes no team drafts (${materialized})`, materialized === 0)
    }
  } finally {
    await cleanup(campaignId)
    // Prove the teardown left nothing orphaned.
    const { count: orphans } = await a.from('plan_allocations').select('id', { count: 'exact', head: true }).eq('client_id', TEST_CLIENT).is('campaign_id', null)
    if ((orphans ?? 0) > 0) console.warn(`⚠️  ${orphans} orphaned plan_allocations rows for TEST_CLIENT — clean by hand`)
  }

  const ok = s.report('Strategist E2E — describe→compose→route→bill→create→ship→mint')
  process.exit(ok ? 0 : 1)
}

main().catch((e) => {
  console.error('FAIL', e)
  process.exit(1)
})
