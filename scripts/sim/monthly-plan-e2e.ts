/**
 * DB-level e2e for the monthly marketing plan. Drives the REAL write path with the service-role
 * client: compose -> draft -> createCampaign -> line items -> order snapshot -> read back -> verify
 * the money agrees at every hop -> teardown.
 *
 * THE ONE THING THIS EXISTS TO PROVE. Three numbers have to be the same number: what the screen
 * showed, what the campaign will bill, and what the snapshot recorded as agreed. The unit tests
 * check the first two in memory. This checks all three AFTER a round trip through Postgres, which
 * is where jsonb coercion, column defaults and RLS get their chance to quietly change one of them.
 *
 * Isolated + self-cleaning: everything hangs off one throwaway campaign, hard-deleted at the end
 * (ON DELETE CASCADE takes the line items and the snapshot with it). Run:
 *   npx tsx --tsconfig scripts/sim/tsconfig.json scripts/sim/monthly-plan-e2e.ts
 */
import { config } from 'dotenv'
import { createAdminClient } from '@/lib/supabase/admin'
import { composeMonthlyPlan, monthlyBill, toCampaignDraft } from '@/lib/campaigns/data/monthly-plan'
import type { MonthlySignals } from '@/lib/campaigns/data/monthly-signals'
import { buildOrderSnapshot } from '@/lib/agreements/order-snapshot'
import { CLIENT_AGREEMENT_VERSION } from '@/lib/agreements/client-agreement'
import { createCampaign } from '@/lib/campaigns/server'
import type { CampaignDraft } from '@/lib/campaigns/types'
import type { PlanInputs } from '@/lib/campaigns/data/plan-inputs'
import { Suite } from './lib'

config({ path: '.env.local' })

/** A real client to hang the throwaway campaign off (FK-safe). Same one db-e2e.ts uses. */
const TEST_CLIENT = '2535fe50-0d78-411f-a59f-cfffbbd239b5'
const TEST_NAME = 'SIM_MONTHLY_PLAN_DELETE_ME'
const TEST_NAME_SIG = 'SIM_MONTHLY_PLAN_SIGNALS_DELETE_ME'

/** The brain fold (Phase 1c): a signals-steered plan must survive Postgres the same way. */
const SIGNALS: MonthlySignals = {
  droppedServiceIds: ['social-mgmt'],
  workingServiceIds: ['gbp-posts'],
  rating: 3.9,
  listingCompleteness: 55,
  hasList: false,
  complaintThemes: ['photos look dark'],
  assembledAt: '2026-07-28T00:00:00Z',
}

const k = (value: unknown, source: string) => ({ value, source })
const INPUTS = {
  goal: k('more-new', 'onboarding'),
  goalWords: k('More new customers walking in', 'onboarding'),
  budget: k(800, 'onboarding'),
  knownFor: k(['Birria Tacos'], 'menu'),
  standsOut: k('Grandmother recipes, tortillas pressed to order', 'onboarding'),
  audience: k(['People who live nearby'], 'onboarding'),
  slowDays: k(['Monday', 'Tuesday'], 'onboarding'),
  channels: [
    { key: 'instagram', name: 'Instagram', connected: true, canPost: true, costOfMissing: '', href: '' },
    { key: 'google_business_profile', name: 'Google', connected: false, canPost: true, costOfMissing: '', href: '' },
  ],
  menu: [],
} as unknown as PlanInputs

async function main() {
  const a = createAdminClient()
  const s = new Suite()

  // leftovers from a crashed prior run
  await a.from('campaigns').delete().eq('name', TEST_NAME)

  let campaignId = ''
  let sigId = ''
  try {
    /* ── compose, exactly as the screen does ─────────────────────────── */
    s.group('compose')
    const goals = ['more-new', 'regulars']
    const edits = { off: new Set(['local-seo']) }
    const plan = composeMonthlyPlan(800, [], edits, goals)
    const screen = monthlyBill(plan.lines)
    s.check('plan has lines', plan.lines.length > 0, `${plan.lines.length} lines`)
    s.check('some lines are held and visible', plan.lines.some((l) => l.held), null)
    s.check('the edit took', !plan.lines.some((l) => l.id === 'local-seo'), null)
    s.check('a bill exists', screen.once > 0, `$${screen.once} once / $${screen.monthly} a month`)

    /* ── the two artifacts the owner's yes produces ───────────────────── */
    const draft = toCampaignDraft(plan.lines, { budgetMonthly: 800, goalKey: goals[0], name: TEST_NAME })
    const snapshot = buildOrderSnapshot({
      agreementVersion: CLIENT_AGREEMENT_VERSION,
      lines: plan.lines,
      inputs: INPUTS,
      edits,
    })

    s.group('before the write')
    s.eq('snapshot once == screen once', snapshot.bill.onceCents, screen.once * 100)
    s.eq('snapshot monthly == screen monthly', snapshot.bill.monthlyCents, screen.monthly * 100)
    s.check(
      'every unbilled line records why',
      snapshot.lines.filter((l) => !l.billed).every((l) => !!l.notBilledBecause),
      null,
    )

    /* ── the real write path ──────────────────────────────────────────── */
    s.group('write')
    campaignId = await createCampaign(TEST_CLIENT, null, draft as unknown as CampaignDraft)
    s.check('createCampaign returned an id', !!campaignId, campaignId)

    const { error: snapErr } = await a.from('campaign_order_snapshots').insert({
      campaign_id: campaignId,
      client_id: TEST_CLIENT,
      agreement_version: snapshot.agreementVersion,
      lines: snapshot.lines,
      bill: snapshot.bill,
      inputs: snapshot.inputs,
      edits: snapshot.edits,
    })
    s.check('snapshot row inserted', !snapErr, snapErr?.message ?? null)

    /* ── read it back, and check the money survived Postgres ──────────── */
    s.group('read back')
    const { data: rows } = await a
      .from('campaign_line_items')
      .select('service_id, price, cadence, included')
      .eq('campaign_id', campaignId)
    const items = rows ?? []
    s.eq('every line persisted', items.length, plan.lines.length)

    let dbOnce = 0
    let dbMonthly = 0
    for (const it of items) {
      if (!it.included) continue
      const kind = (it.cadence as { kind?: string } | null)?.kind
      if (kind === 'recurring') dbMonthly += Number(it.price)
      else dbOnce += Number(it.price)
    }
    s.eq('DB bills the same once total as the screen', dbOnce, screen.once)
    s.eq('DB bills the same monthly total as the screen', dbMonthly, screen.monthly)

    const heldIds = plan.lines.filter((l) => l.held).map((l) => l.id)
    const heldRows = items.filter((i) => heldIds.includes(String(i.service_id)))
    s.eq('every held line persisted', heldRows.length, heldIds.length)
    s.check('and none of them are billable', heldRows.every((r) => r.included === false), null)

    const { data: snapRow } = await a
      .from('campaign_order_snapshots')
      .select('agreement_version, bill, lines, edits, inputs, agreed_at')
      .eq('campaign_id', campaignId)
      .maybeSingle()
    s.check('snapshot reads back', !!snapRow, null)
    if (snapRow) {
      const bill = snapRow.bill as { onceCents: number; monthlyCents: number }
      s.eq('snapshot survived the round trip (once)', bill.onceCents, screen.once * 100)
      s.eq('snapshot survived the round trip (monthly)', bill.monthlyCents, screen.monthly * 100)
      s.eq('the terms version was recorded', snapRow.agreement_version, CLIENT_AGREEMENT_VERSION)
      s.check('the owner edit was recorded', JSON.stringify(snapRow.edits).includes('local-seo'), null)
      s.check('inputs kept their sources', JSON.stringify(snapRow.inputs).includes('onboarding'), null)
      s.check('agreed_at was stamped', !!snapRow.agreed_at, String(snapRow.agreed_at))
    }

    /* ── the goals genuinely change the plan ──────────────────────────── */
    s.group('goals steer the plan')
    const reviewsOnly = composeMonthlyPlan(800, [], {}, ['reviews'])
    const newOnly = composeMonthlyPlan(800, [], {}, ['more-new'])
    const ids = (p: typeof reviewsOnly) => p.lines.filter((l) => !l.held).map((l) => l.id)
    s.check(
      'different goals produce different plans',
      ids(reviewsOnly).join() !== ids(newOnly).join(),
      `reviews: ${ids(reviewsOnly).join(', ')}`,
    )
    s.check('a reviews plan carries review work', ids(reviewsOnly).some((i) => i.startsWith('review')), null)

    /* ── the brain fold: a signals-steered plan through the same write path ── */
    s.group('signals-steered plan survives Postgres')
    await a.from('campaigns').delete().eq('name', TEST_NAME_SIG)
    const sigPlan = composeMonthlyPlan(800, [], {}, goals, undefined, false, undefined, undefined, SIGNALS)
    const sigScreen = monthlyBill(sigPlan.lines)
    s.check('signals plan composes', sigPlan.lines.length > 0, `${sigPlan.lines.length} lines`)
    s.check('the proven loser is not bought for depth', !sigPlan.lines.some((l) => l.id === 'social-mgmt' && !l.held && !l.have), null)
    const sigDraft = toCampaignDraft(sigPlan.lines, { budgetMonthly: 800, goalKey: goals[0], name: TEST_NAME_SIG })
    sigId = await createCampaign(TEST_CLIENT, null, sigDraft as unknown as CampaignDraft)
    s.check('createCampaign returned an id', !!sigId, sigId)
    const { data: sigRows } = await a
      .from('campaign_line_items')
      .select('service_id, price, cadence, included')
      .eq('campaign_id', sigId)
    let sOnce = 0
    let sMonthly = 0
    for (const it of sigRows ?? []) {
      if (!it.included) continue
      const kind = (it.cadence as { kind?: string } | null)?.kind
      if (kind === 'recurring') sMonthly += Number(it.price)
      else sOnce += Number(it.price)
    }
    s.eq('DB once == screen once (signals)', sOnce, sigScreen.once)
    s.eq('DB monthly == screen monthly (signals)', sMonthly, sigScreen.monthly)
  } finally {
    // teardown — cascade takes the line items and the snapshot
    if (campaignId) await a.from('campaigns').delete().eq('id', campaignId)
    if (sigId) await a.from('campaigns').delete().eq('id', sigId)
    await a.from('campaigns').delete().eq('name', TEST_NAME)
    await a.from('campaigns').delete().eq('name', TEST_NAME_SIG)
  }

  const ok = s.report('DB e2e — monthly marketing plan')
  process.exit(ok ? 0 : 1)
}

main().catch((e) => {
  console.error('FAIL', e)
  process.exit(1)
})
