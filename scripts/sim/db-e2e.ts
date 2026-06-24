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
  } finally {
    // ── teardown: cascade removes the orders ───────────────────────────
    await a.from('campaigns').delete().eq('id', campaignId)
  }

  const ok = s.report('DB e2e — creator work orders')
  process.exit(ok ? 0 : 1)
}

main().catch((e) => { console.error('FAIL', e); process.exit(1) })
