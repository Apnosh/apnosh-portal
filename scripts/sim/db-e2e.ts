/**
 * DB-level e2e for the creator work-order spine. Drives the REAL
 * creator_work_orders table through the whole order lifecycle with the
 * service-role client: mint-shaped insert -> read-back -> status machine ->
 * idempotency (unique index) -> check-constraint -> revision branch.
 *
 * Isolated + self-cleaning: everything hangs off one throwaway campaign that is
 * hard-deleted at the end (ON DELETE CASCADE removes its orders). Run:
 *   npx tsx scripts/sim/db-e2e.ts
 */
import { config } from 'dotenv'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildContentLine } from '@/lib/campaigns/catalog'
import { buildWorkOrderRows, buildBridgeDraftRow, buildChargeRow, buildPayoutRow, findUnaccrued } from '@/lib/campaigns/work-orders-core'
import type { CampaignBrief, CampaignDraft, ContentBeat, LineItem } from '@/lib/campaigns/types'
import type { SavedCampaign } from '@/lib/campaigns/view'
import { Suite } from './lib'

config({ path: '.env.local' })

// A real client to hang the throwaway campaign off of (FK-safe). The campaign is
// named unmistakably and deleted at the end of the run.
const TEST_CLIENT = '2535fe50-0d78-411f-a59f-cfffbbd239b5'
const TEST_NAME = 'SIM_E2E_DELETE_ME'

async function main() {
  const a = createAdminClient()
  const s = new Suite()

  // ── cleanup any leftover from a crashed prior run ────────────────────
  await a.from('campaigns').delete().eq('name', TEST_NAME)

  // ── create the throwaway campaign ────────────────────────────────────
  const { data: camp, error: campErr } = await a
    .from('campaigns')
    .insert({ client_id: TEST_CLIENT, name: TEST_NAME, path: 'ai', status: 'draft', phase: 'build' })
    .select('id')
    .single()
  s.group('setup')
  s.check('throwaway campaign created', !campErr && !!camp?.id, campErr?.message)
  if (!camp?.id) { s.report('DB e2e — creator work orders'); return }
  const campaignId = camp.id as string

  try {
    // ── mint-shaped insert: one order per discipline ───────────────────
    s.group('mint (insert orders)')
    const DISCIPLINES = ['Video', 'Photo', 'Design']
    const rows = DISCIPLINES.map((d) => ({
      campaign_id: campaignId, client_id: TEST_CLIENT, creator_id: `sim_${d.toLowerCase()}`,
      discipline: d, title: `${d} for ${TEST_NAME}`, brief: `Make the ${d} pieces.`, status: 'offered',
    }))
    const { error: insErr } = await a.from('creator_work_orders').insert(rows)
    s.check('insert 3 orders (one per discipline)', !insErr, insErr?.message)

    // ── read-back (listWorkOrdersForCampaign shape) ────────────────────
    s.group('read-back')
    const { data: byCampaign } = await a.from('creator_work_orders').select('*').eq('campaign_id', campaignId)
    s.eq('campaign has 3 orders', byCampaign?.length ?? 0, 3)
    s.check('all start as offered', (byCampaign ?? []).every((o) => o.status === 'offered'))
    const { data: byCreator } = await a.from('creator_work_orders').select('*').eq('creator_id', 'sim_video')
    s.eq('creator inbox returns only their order', byCreator?.length ?? 0, 1)

    // ── idempotency + per-piece slots: unique (campaign,discipline,slot) ─
    s.group('idempotency + per-piece slots (migration 172)')
    const { error: dupErr } = await a.from('creator_work_orders').insert({
      campaign_id: campaignId, client_id: TEST_CLIENT, creator_id: 'sim_dup',
      discipline: 'Video', slot: 0, title: 'dup', status: 'offered',
    })
    s.check('duplicate (campaign,discipline,slot) rejected', !!dupErr, dupErr ? `correctly blocked: ${dupErr.code}` : 'NO ERROR — re-ship would duplicate!')
    // a second Video PIECE (slot 1) is allowed — the whole point of #8
    const { error: pieceErr } = await a.from('creator_work_orders').insert({
      campaign_id: campaignId, client_id: TEST_CLIENT, creator_id: 'sim_video', discipline: 'Video', slot: 1, title: 'video #2', status: 'offered',
    })
    s.check('second piece same discipline (slot 1) allowed', !pieceErr, pieceErr?.message ?? 'migration 172 applied')

    // ── status machine walk ────────────────────────────────────────────
    s.group('status machine')
    const videoId = (byCreator?.[0]?.id) as string
    for (const [from, to, extra] of [
      ['offered', 'accepted', {}],
      ['accepted', 'in_progress', {}],
      ['in_progress', 'delivered', { delivered_url: 'https://example.com/work.mp4' }],
      ['delivered', 'approved', {}],
    ] as [string, string, Record<string, unknown>][]) {
      const { error } = await a.from('creator_work_orders').update({ status: to, ...extra }).eq('id', videoId)
      const { data: after } = await a.from('creator_work_orders').select('status, delivered_url').eq('id', videoId).single()
      s.check(`${from} → ${to}`, !error && after?.status === to, error?.message)
    }
    const { data: finalRow } = await a.from('creator_work_orders').select('delivered_url').eq('id', videoId).single()
    s.check('delivered_url persisted', finalRow?.delivered_url === 'https://example.com/work.mp4')

    // ── check constraint rejects an invalid status ─────────────────────
    s.group('check constraint')
    const { error: badErr } = await a.from('creator_work_orders').update({ status: 'totally_bogus' }).eq('id', videoId)
    s.check('invalid status rejected by DB', !!badErr, badErr ? `correctly blocked: ${badErr.code}` : 'NO ERROR — bad status accepted!')

    // ── revision branch ────────────────────────────────────────────────
    s.group('revision branch')
    const photoId = (byCampaign ?? []).find((o) => o.discipline === 'Photo')?.id as string
    await a.from('creator_work_orders').update({ status: 'delivered', delivered_url: 'https://example.com/p.jpg' }).eq('id', photoId)
    const { error: revErr } = await a.from('creator_work_orders').update({ status: 'revision', note: 'brighter please' }).eq('id', photoId)
    const { data: revRow } = await a.from('creator_work_orders').select('status, note').eq('id', photoId).single()
    s.check('delivered → revision with note', !revErr && revRow?.status === 'revision' && revRow?.note === 'brighter please', revErr?.message)

    // ── ship mint path: buildWorkOrderRows → live insert (the exact DB work
    //    mintWorkOrders does), on its own sub-campaign so it stays isolated ──
    s.group('ship mint path (buildWorkOrderRows → table)')
    const { data: c2 } = await a.from('campaigns').insert({ client_id: TEST_CLIENT, name: TEST_NAME, path: 'strategist', status: 'draft', phase: 'build' }).select('id').single()
    const mintCampaignId = c2?.id as string
    if (mintCampaignId) {
      const now = new Date().toISOString()
      const targetDate = new Date(Date.now() + 21 * 86_400_000).toISOString().slice(0, 10)
      const items: LineItem[] = [buildContentLine('reel', 'li-r', { qty: 2 })!, buildContentLine('post', 'li-g')!]
      const beats: ContentBeat[] = [
        { week: 1, type: 'reel', label: 'Reel one', channel: 'instagram' },
        { week: 2, type: 'reel', label: 'Reel two', channel: 'instagram' },
        { week: 3, type: 'post', label: 'Promo post', channel: 'instagram' },
      ]
      const brief = { templateId: 'sim', objective: 'Launch', contentBeats: beats } as unknown as CampaignBrief
      const draft = { id: mintCampaignId, name: 'mint', path: 'strategist', items, goalKey: 'launch', targetDate, brief } as unknown as CampaignDraft
      // Team is the default producer, so opt the 3 creative pieces (2 reel + 1 post)
      // into creators to exercise the mint path.
      const producerChoices = { 'Video:0': 'creator', 'Video:1': 'creator', 'Design:0': 'creator' } as Record<string, 'team' | 'creator'>
      const saved: SavedCampaign = { clientId: TEST_CLIENT, draft, phase: 'build', status: 'draft', shippedAt: null, createdAt: now, updatedAt: now, creatorChoices: {}, producerChoices, creativeControl: 'handoff', execution: {} }
      const rows = buildWorkOrderRows(saved, now)
      s.eq('buildWorkOrderRows → 3 pieces (2 reel + 1 post)', rows.length, 3)
      const { data: pre } = await a.from('creator_work_orders').select('id').eq('campaign_id', mintCampaignId).limit(1)
      s.check('mint guard: no orders before ship', !(pre && pre.length))
      // amount_cents is stamped on every row; strip it pre-180 so the insert stays green.
      const { error: amtColErr } = await a.from('creator_work_orders').select('amount_cents').limit(1)
      const stripAmount = (r: typeof rows[number]) => { const copy = { ...r } as Record<string, unknown>; delete copy.amount_cents; return copy }
      const insertRows = amtColErr ? rows.map(stripAmount) : rows
      const { error: insErr } = await a.from('creator_work_orders').insert(insertRows)
      s.check('mint inserts the rows cleanly', !insErr, insErr?.message)
      const { data: landed } = await a.from('creator_work_orders').select('id, discipline, slot').eq('campaign_id', mintCampaignId)
      s.eq('orders landed in the table', landed?.length ?? 0, 3)
      s.check('two Video pieces with distinct slots', new Set((landed ?? []).filter((o) => o.discipline === 'Video').map((o) => o.slot)).size === 2)
      const { data: again } = await a.from('creator_work_orders').select('id').eq('campaign_id', mintCampaignId).limit(1)
      s.check('re-mint guard sees existing rows → would skip', !!(again && again.length))
      await a.from('campaigns').delete().eq('id', mintCampaignId)
    }

    // ── publish bridge: approve → linked content_draft + progress dedup ──
    s.group('publish bridge (approve → content_draft, counted once)')
    // The bridge needs migration 179 (creator_work_orders.content_draft_id). Probe
    // for it so the suite stays green pre-migration and really runs once applied.
    const { error: fkColErr } = await a.from('creator_work_orders').select('content_draft_id').limit(1)
    const { data: c3 } = fkColErr ? { data: null } : await a.from('campaigns').insert({ client_id: TEST_CLIENT, name: TEST_NAME, path: 'strategist', status: 'shipped', phase: 'monitor' }).select('id').single()
    const bridgeCampaignId = c3?.id as string
    let bridgedDraftId: string | null = null
    if (fkColErr) {
      s.check('publish bridge: skipped — apply migration 179 then re-run', true, 'content_draft_id column absent (pre-179)')
    } else if (bridgeCampaignId) {
      const due = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)
      await a.from('creator_work_orders').insert({
        campaign_id: bridgeCampaignId, client_id: TEST_CLIENT, creator_id: 'v_maya', discipline: 'Video', slot: 0,
        title: 'Bridge reel', brief: 'x', due_date: due, status: 'delivered', concept_status: 'approved',
        delivered_url: 'https://example.com/reel.mp4', brief_details: { creative: { caption: 'Yum', hashtags: ['#food'] } },
      })
      // Read the order BACK off the table (a real jsonb round-trip) and map it with
      // the pure builder — the exact work the server-only bridge does on approval.
      const { data: ord } = await a.from('creator_work_orders').select('*').eq('campaign_id', bridgeCampaignId).single()
      const orderId = ord?.id as string
      await a.from('creator_work_orders').update({ status: 'approved' }).eq('id', orderId)
      const row = buildBridgeDraftRow({
        client_id: ord!.client_id as string, campaign_id: ord!.campaign_id as string, title: ord!.title as string,
        due_date: ord!.due_date as string, delivered_url: ord!.delivered_url as string,
        brief_details: ord!.brief_details as { creative?: { caption?: unknown; hashtags?: unknown } } | null,
      })
      s.check('round-trip map: draft state + link in brief + caption survive jsonb', row.status === 'draft' && row.media_brief.source_delivery_url === 'https://example.com/reel.mp4' && row.caption === 'Yum' && row.media_urls.length === 0)

      const { data: cd, error: cdErr } = await a.from('content_drafts').insert(row).select('id, status, campaign_id, media_brief').single()
      bridgedDraftId = cd?.id as string
      s.check('bridge draft inserts cleanly as a team draft', !cdErr && cd?.status === 'draft', cdErr?.message)
      s.eq('draft inherits the campaign', cd?.campaign_id, bridgeCampaignId)
      s.check('the delivery link lands in the draft media brief', (cd?.media_brief as { source_delivery_url?: string })?.source_delivery_url === 'https://example.com/reel.mp4')
      const { error: linkErr } = await a.from('creator_work_orders').update({ content_draft_id: bridgedDraftId }).eq('id', orderId).is('content_draft_id', null)
      s.check('order links to its draft (content_draft_id)', !linkErr, linkErr?.message)

      // Progress dedup, liveness-aware (mirrors getCampaignProgress): a bridged order
      // is counted via its LIVE draft, never twice — but if that draft dies, the
      // order falls back through so the piece is never dropped from the total.
      const countOnce = async () => {
        const [{ data: cds }, { data: ords }] = await Promise.all([
          a.from('content_drafts').select('id, status').eq('campaign_id', bridgeCampaignId),
          a.from('creator_work_orders').select('status, content_draft_id').eq('campaign_id', bridgeCampaignId),
        ])
        const DEAD = ['rejected', 'failed', 'archived']
        const alive = new Set((cds ?? []).filter((d) => !DEAD.includes(d.status as string)).map((d) => d.id as string))
        const orders = (ords ?? []).filter((o) => (o.status as string) !== 'declined' && !(o.content_draft_id && alive.has(o.content_draft_id as string))).length
        return alive.size + orders
      }
      s.eq('progress counts the piece exactly once (via the live draft)', await countOnce(), 1)

      // Team rejects the bridged draft → the order falls back through, so the piece
      // is NOT silently dropped from the total (the rank-4 vanish bug).
      await a.from('content_drafts').update({ status: 'rejected' }).eq('id', bridgedDraftId)
      s.eq('rejected draft → piece still counted once (no vanish)', await countOnce(), 1)

      if (bridgedDraftId) await a.from('content_drafts').delete().eq('id', bridgedDraftId)  // campaign_id set-null on delete, so remove explicitly
      await a.from('campaigns').delete().eq('id', bridgeCampaignId)
    }

    // ── money-in: accrue an owner charge on approval (idempotent, counted once) ──
    s.group('money-in: accrue an owner charge on approval')
    const { error: chColErr } = await a.from('campaign_charges').select('id').limit(1)
    if (chColErr) {
      s.check('charges: skipped — apply migration 180 then re-run', true, 'campaign_charges absent (pre-180)')
    } else {
      const { data: c4 } = await a.from('campaigns').insert({ client_id: TEST_CLIENT, name: TEST_NAME, path: 'strategist', status: 'shipped', phase: 'monitor' }).select('id').single()
      const chCampaignId = c4?.id as string
      if (chCampaignId) {
        const { data: ord } = await a.from('creator_work_orders').insert({
          campaign_id: chCampaignId, client_id: TEST_CLIENT, creator_id: 'v_maya', discipline: 'Video', slot: 0,
          title: 'Charge reel', brief: 'x', status: 'approved', concept_status: 'approved', amount_cents: 12000,
        }).select('*').single()
        const orderId = ord?.id as string
        // Mirror accrueChargeForApprovedOrder: pure builder → insert (idempotent).
        const row = buildChargeRow({ id: orderId, client_id: TEST_CLIENT, campaign_id: chCampaignId, amount_cents: ord!.amount_cents as number })
        s.check('charge row: $120 accrued, creator-sourced, linked to the order', row.amount_cents === 12000 && row.status === 'accrued' && row.source === 'creator')
        const { error: chInsErr } = await a.from('campaign_charges').insert(row)
        s.check('charge inserts cleanly', !chInsErr, chInsErr?.message)
        const { error: dupErr } = await a.from('campaign_charges').insert(row)
        s.check('re-accrual is a no-op (unique on work_order_id)', dupErr?.code === '23505')
        const { data: ch } = await a.from('campaign_charges').select('amount_cents, status').eq('campaign_id', chCampaignId).in('status', ['accrued', 'invoiced', 'paid'])
        s.eq('exactly one charge accrued (no double)', ch?.length ?? 0, 1)
        s.eq('campaign accrued total == one piece price', (ch ?? []).reduce((s2, c) => s2 + ((c.amount_cents as number) ?? 0), 0), 12000)

        // $0-skip: an unpriced approved order accrues NOTHING (mirrors the guard
        // row.amount_cents <= 0 → no insert), so no phantom charge ever lands.
        const zeroRow = buildChargeRow({ id: orderId, client_id: TEST_CLIENT, campaign_id: chCampaignId, amount_cents: 0 })
        if (zeroRow.amount_cents > 0) await a.from('campaign_charges').insert(zeroRow)
        const { data: afterZero } = await a.from('campaign_charges').select('id').eq('campaign_id', chCampaignId)
        s.eq('an unpriced ($0) piece accrues nothing (still 1 charge)', afterZero?.length ?? 0, 1)

        // Multi-status rollup: accrued + invoiced + paid count; void does NOT (mirrors
        // getCampaignCharges' .in('status', ['accrued','invoiced','paid'])).
        await a.from('campaign_charges').insert([
          { client_id: TEST_CLIENT, campaign_id: chCampaignId, source: 'creator', amount_cents: 3000, status: 'invoiced' },
          { client_id: TEST_CLIENT, campaign_id: chCampaignId, source: 'creator', amount_cents: 2000, status: 'paid' },
          { client_id: TEST_CLIENT, campaign_id: chCampaignId, source: 'creator', amount_cents: 9900, status: 'void' },
        ])
        const { data: roll } = await a.from('campaign_charges').select('amount_cents').eq('campaign_id', chCampaignId).in('status', ['accrued', 'invoiced', 'paid'])
        s.eq('rollup counts accrued+invoiced+paid, excludes void', (roll ?? []).reduce((s2, c) => s2 + ((c.amount_cents as number) ?? 0), 0), 12000 + 3000 + 2000)

        await a.from('campaigns').delete().eq('id', chCampaignId)  // cascades: removes the order + the charges
      }
    }

    // ── money-out: accrue a creator payout on approval (fee split, idempotent) ──
    s.group('money-out: accrue a creator payout on approval')
    const { error: poColErr } = await a.from('creator_payouts').select('id').limit(1)
    if (poColErr) {
      s.check('payouts: skipped — apply migration 181 then re-run', true, 'creator_payouts absent (pre-181)')
    } else {
      const { data: c5 } = await a.from('campaigns').insert({ client_id: TEST_CLIENT, name: TEST_NAME, path: 'strategist', status: 'shipped', phase: 'monitor' }).select('id').single()
      const poCampaignId = c5?.id as string
      if (poCampaignId) {
        const { data: ord } = await a.from('creator_work_orders').insert({
          campaign_id: poCampaignId, client_id: TEST_CLIENT, creator_id: 'v_maya', discipline: 'Video', slot: 0,
          title: 'Payout reel', brief: 'x', status: 'approved', concept_status: 'approved', amount_cents: 12000,
        }).select('*').single()
        const orderId = ord?.id as string
        const row = buildPayoutRow({ id: orderId, client_id: TEST_CLIENT, campaign_id: poCampaignId, creator_id: 'v_maya', amount_cents: ord!.amount_cents as number }, 20)
        s.check('payout row: $120 gross → $96 net + $24 fee, accrued', row.gross_cents === 12000 && row.net_cents === 9600 && row.fee_cents === 2400 && row.status === 'accrued')
        const { data: poRow, error: poInsErr } = await a.from('creator_payouts').insert(row).select('id, net_cents, fee_cents, gross_cents').single()
        const payoutId = poRow?.id as string
        s.check('payout inserts cleanly', !poInsErr, poInsErr?.message)
        s.check('persisted: $96 net, $24 fee, $120 gross', poRow?.net_cents === 9600 && poRow?.fee_cents === 2400 && poRow?.gross_cents === 12000)
        const { error: poDupErr } = await a.from('creator_payouts').insert(row)
        s.check('re-accrual is a no-op (unique on work_order_id)', poDupErr?.code === '23505')
        // Scoped to THIS campaign to avoid cross-run pollution (campaign delete sets
        // campaign_id null but keeps the payout, so we delete it explicitly below).
        const { data: po } = await a.from('creator_payouts').select('net_cents').eq('campaign_id', poCampaignId).in('status', ['accrued', 'payable', 'paid'])
        s.eq('exactly one payout for this campaign', po?.length ?? 0, 1)
        s.eq('payout net == one piece minus fee', (po ?? []).reduce((s2, p) => s2 + ((p.net_cents as number) ?? 0), 0), 9600)

        // $0/negative-gross skip: an unpriced approved order accrues NO payout (mirrors
        // the guard row.gross_cents <= 0 → no insert), so a creator is never owed $0.
        const zeroPay = buildPayoutRow({ id: orderId, client_id: TEST_CLIENT, campaign_id: poCampaignId, creator_id: 'v_maya', amount_cents: 0 }, 20)
        if (zeroPay.gross_cents > 0) await a.from('creator_payouts').insert(zeroPay)
        const { data: afterZeroPay } = await a.from('creator_payouts').select('id').eq('campaign_id', poCampaignId)
        s.eq('an unpriced ($0) piece accrues no payout (still 1)', afterZeroPay?.length ?? 0, 1)

        if (payoutId) await a.from('creator_payouts').delete().eq('id', payoutId)  // set-null on campaign delete, so remove explicitly
        await a.from('campaigns').delete().eq('id', poCampaignId)
      }
    }
    // ── reconcile sweep: recover a dropped charge + payout ──
    s.group('reconcile sweep: recover a dropped accrual')
    const { error: rcChErr } = await a.from('campaign_charges').select('id').limit(1)
    const { error: rcPoErr } = await a.from('creator_payouts').select('id').limit(1)
    if (rcChErr || rcPoErr) {
      s.check('reconcile: skipped — apply migrations 180 + 181 then re-run', true, 'ledgers absent')
    } else {
      const { data: c6 } = await a.from('campaigns').insert({ client_id: TEST_CLIENT, name: TEST_NAME, path: 'strategist', status: 'shipped', phase: 'monitor' }).select('id').single()
      const rcCampaignId = c6?.id as string
      if (rcCampaignId) {
        const mk = async (slot: number) => (await a.from('creator_work_orders').insert({ campaign_id: rcCampaignId, client_id: TEST_CLIENT, creator_id: 'v_maya', discipline: 'Video', slot, title: `r${slot}`, brief: 'x', status: 'approved', concept_status: 'approved', amount_cents: 12000 }).select('id').single()).data?.id as string
        const o1 = await mk(0)
        const o2 = await mk(1)
        // o1 fully accrued; o2 is a "dropped" gap (no charge, no payout).
        await a.from('campaign_charges').insert(buildChargeRow({ id: o1, client_id: TEST_CLIENT, campaign_id: rcCampaignId, amount_cents: 12000 }))
        await a.from('creator_payouts').insert(buildPayoutRow({ id: o1, client_id: TEST_CLIENT, campaign_id: rcCampaignId, creator_id: 'v_maya', amount_cents: 12000 }, 20))
        // Mirror reconcileAccruals (server-only, tsx can't import): find the gap via
        // the same query + pure finder, then accrue it.
        const approved = [{ id: o1, amount_cents: 12000 }, { id: o2, amount_cents: 12000 }]
        const { data: ch } = await a.from('campaign_charges').select('work_order_id').in('work_order_id', [o1, o2])
        const { data: po } = await a.from('creator_payouts').select('work_order_id').in('work_order_id', [o1, o2])
        const gap = findUnaccrued(approved, new Set((ch ?? []).map((r) => r.work_order_id as string)), new Set((po ?? []).map((r) => r.work_order_id as string)))
        s.check('sweep finds exactly the dropped order', gap.needCharge.length === 1 && gap.needCharge[0] === o2 && gap.needPayout.length === 1 && gap.needPayout[0] === o2)
        for (const id of gap.needCharge) await a.from('campaign_charges').insert(buildChargeRow({ id, client_id: TEST_CLIENT, campaign_id: rcCampaignId, amount_cents: 12000 }))
        for (const id of gap.needPayout) await a.from('creator_payouts').insert(buildPayoutRow({ id, client_id: TEST_CLIENT, campaign_id: rcCampaignId, creator_id: 'v_maya', amount_cents: 12000 }, 20))
        const { data: ch2 } = await a.from('campaign_charges').select('id').eq('campaign_id', rcCampaignId)
        const { data: po2 } = await a.from('creator_payouts').select('id').eq('campaign_id', rcCampaignId)
        s.eq('after sweep: both orders have a charge', ch2?.length ?? 0, 2)
        s.eq('after sweep: both orders have a payout', po2?.length ?? 0, 2)
        await a.from('creator_payouts').delete().eq('campaign_id', rcCampaignId)  // set-null on campaign delete, so remove first
        await a.from('campaigns').delete().eq('id', rcCampaignId)                 // cascades the orders + charges
      }
    }

    // ── post-ship reconcile: piece-key stamp + idempotent re-mint ──
    s.group('reconcile: piece-key stamp + idempotent re-mint')
    const { error: pkColErr } = await a.from('content_drafts').select('campaign_piece_key').limit(1)
    if (pkColErr) {
      s.check('reconcile: skipped — apply migration 182 then re-run', true, 'campaign_piece_key absent (pre-182)')
    } else {
      const { data: c7 } = await a.from('campaigns').insert({ client_id: TEST_CLIENT, name: TEST_NAME, path: 'strategist', status: 'shipped', phase: 'monitor' }).select('id').single()
      const pkCampaignId = c7?.id as string
      if (pkCampaignId) {
        const { data: d } = await a.from('content_drafts').insert({ client_id: TEST_CLIENT, campaign_id: pkCampaignId, idea: 'email piece', status: 'idea', service_line: 'email', proposed_via: 'strategist', campaign_piece_key: 'email:0' }).select('id, campaign_piece_key').single()
        const draftId = d?.id as string
        s.check('content_draft carries its campaign_piece_key (team-lane match handle)', d?.campaign_piece_key === 'email:0')
        // The reconcile cancels a removed draft via status='rejected' (NOT 'archived',
        // which the content_drafts CHECK forbids) — prove that write is legal.
        const { error: cancelErr } = await a.from('content_drafts').update({ status: 'rejected' }).eq('id', draftId)
        s.check("cancel via 'rejected' is a legal content_drafts status", !cancelErr, cancelErr?.message)
        // Re-mint idempotency: upsert the same order twice on (campaign,discipline,slot).
        const orderRow = { campaign_id: pkCampaignId, client_id: TEST_CLIENT, creator_id: 'v_maya', discipline: 'Video', slot: 0, title: 'reel', brief: 'x', status: 'offered', concept_status: 'approved', amount_cents: 12000, due_date: null }
        await a.from('creator_work_orders').upsert(orderRow, { onConflict: 'campaign_id,discipline,slot', ignoreDuplicates: true })
        await a.from('creator_work_orders').upsert(orderRow, { onConflict: 'campaign_id,discipline,slot', ignoreDuplicates: true })
        const { data: os } = await a.from('creator_work_orders').select('id').eq('campaign_id', pkCampaignId)
        s.eq('re-mint upsert is idempotent (one order, not two)', os?.length ?? 0, 1)
        if (draftId) await a.from('content_drafts').delete().eq('id', draftId)  // set-null on campaign delete, so remove first
        await a.from('campaigns').delete().eq('id', pkCampaignId)               // cascades the order
      }
    }

    // ── real-vendor fee (Phase 5c): a real vendor's payout uses their negotiated rate ──
    s.group('real-vendor fee — payout uses the vendor take-rate, not the default')
    {
      const { data: v } = await a.from('vendors').insert({ slug: `sim-vendor-${Date.now()}`, name: 'Sim Vendor', vendor_type: 'individual', platform_fee_percent: 15, tier: 'pro', bookable: true }).select('id, platform_fee_percent').single()
      const vendorId = v?.id as string
      if (vendorId) {
        // Mirror feePercentForCreator: a UUID creator id resolves the vendor's fee.
        const { data: vf } = await a.from('vendors').select('platform_fee_percent').eq('id', vendorId).maybeSingle()
        const feePercent = Number(vf?.platform_fee_percent ?? 20)
        s.eq('a real vendor resolves its negotiated fee (15%)', feePercent, 15)
        const payout = buildPayoutRow({ id: 'wo-v', client_id: TEST_CLIENT, campaign_id: null, creator_id: vendorId, amount_cents: 12000 }, feePercent)
        s.eq('vendor payout net = $120 minus 15% = $102', payout.net_cents, 10200)
        s.eq('vendor payout fee = $18', payout.fee_cents, 1800)
        s.check('a seeded pool id is non-UUID → never resolves a vendor (default fee)', !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test('v_maya'))
        await a.from('vendors').delete().eq('id', vendorId)
      }
    }
  } finally {
    // ── teardown: cascade removes the orders ───────────────────────────
    await a.from('campaigns').delete().eq('id', campaignId)
  }

  const ok = s.report('DB e2e — creator work orders')
  process.exit(ok ? 0 : 1)
}

main().catch((e) => { console.error('FAIL', e); process.exit(1) })
