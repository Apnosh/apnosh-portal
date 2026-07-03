/**
 * /api/cron/awaiting-you-digest — the daily safety net against silent stalls.
 *
 * Per client with shipped campaigns: sum CampaignProgress.awaitingYou (delivered
 * creator pieces + approved-but-unsigned drafts) across all their campaigns and,
 * when anything is waiting, send ONE owner notification for the day pointing at
 * the inbox. Event-driven notifications (delivered/approved hooks) are the fast
 * path; this digest catches whatever they missed, so work never waits invisibly.
 *
 * Idempotency: one digest per owner per UTC day — deduped by querying today's
 * notifications of this type before sending (monthly-recap pattern).
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCampaignProgressBatch } from '@/lib/campaigns/server'
import { notifyClientOwners } from '@/lib/notifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const CRON_SECRET = process.env.CRON_SECRET

export async function GET(req: Request) {
  const url = new URL(req.url)
  const querySecret = url.searchParams.get('secret')
  const headerSecret = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  const isVercelCron = req.headers.get('user-agent')?.includes('vercel-cron')
  if (!isVercelCron && querySecret !== CRON_SECRET && headerSecret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()

  // All shipped campaigns in one read (no per-client listCampaigns — that pulls
  // line items + briefs), grouped by client for the batch progress rollup.
  const { data: campaigns, error } = await admin
    .from('campaigns')
    .select('id, client_id')
    .eq('status', 'shipped')
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  const byClient = new Map<string, string[]>()
  for (const c of campaigns ?? []) {
    const cid = c.client_id as string
    byClient.set(cid, [...(byClient.get(cid) ?? []), c.id as string])
  }
  if (byClient.size === 0) return NextResponse.json({ ok: true, clients: 0, notified: 0 })

  const progressById = await getCampaignProgressBatch((campaigns ?? []).map((c) => c.id as string))

  // Who already got today's digest (dedupe across manual re-runs).
  const todayStart = new Date()
  todayStart.setUTCHours(0, 0, 0, 0)
  const { data: sentToday } = await admin
    .from('notifications')
    .select('user_id')
    .eq('type', 'awaiting_you_digest')
    .gte('created_at', todayStart.toISOString())
  const alreadySent = new Set((sentToday ?? []).map((n) => n.user_id as string))

  let notified = 0
  const outcomes: { clientId: string; waiting: number; sent: boolean }[] = []
  for (const [clientId, ids] of byClient) {
    const waiting = ids.reduce((n, id) => n + (progressById[id]?.awaitingYou ?? 0), 0)
    if (waiting <= 0) { outcomes.push({ clientId, waiting: 0, sent: false }); continue }
    // If every owner of this client already got today's digest, skip. We resolve
    // recipients the same way notifyClientOwners does — via a cheap union read.
    const [{ data: cu }, { data: biz }] = await Promise.all([
      admin.from('client_users').select('auth_user_id').eq('client_id', clientId),
      admin.from('businesses').select('owner_id').eq('client_id', clientId),
    ])
    const ownerIds = new Set<string>([
      ...(cu ?? []).map((r) => r.auth_user_id as string),
      ...(biz ?? []).map((r) => r.owner_id as string).filter(Boolean),
    ])
    if (ownerIds.size > 0 && [...ownerIds].every((u) => alreadySent.has(u))) {
      outcomes.push({ clientId, waiting, sent: false })
      continue
    }
    await notifyClientOwners(clientId, {
      kind: 'awaiting_you_digest',
      title: waiting === 1 ? '1 piece is waiting on you' : `${waiting} pieces are waiting on you`,
      body: 'Finished work needs your OK before it can go out. A quick look clears it.',
      link: '/dashboard/inbox',
    }).catch(() => ({ notified: 0 }))
    notified++
    outcomes.push({ clientId, waiting, sent: true })
  }

  return NextResponse.json({ ok: true, clients: byClient.size, notified, outcomes })
}
