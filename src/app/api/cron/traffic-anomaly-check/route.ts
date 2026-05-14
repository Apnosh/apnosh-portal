/**
 * Daily Vercel cron: detect traffic drops/spikes for every client
 * with GA data and notify the business owner. Specifically:
 *
 *   - Compares yesterday's visitors to the 14-day median.
 *   - >40% drop  → "Traffic dropped" notification (rose tone).
 *   - >150% spike → "Traffic spiked" notification (good news,
 *     so owners can capitalize: check what's working).
 *
 * Dedupe: at most one notification per (client, direction) per
 * 7-day window so a sustained dip doesn't spam.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createNotification } from '@/lib/notifications'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

const CRON_SECRET = process.env.CRON_SECRET
const DROP_THRESHOLD = 0.40   /* 40% drop from median triggers */
const SPIKE_THRESHOLD = 1.5    /* 150% above median triggers */
const DEDUPE_WINDOW_DAYS = 7
const MIN_BASELINE_VISITORS = 20 /* skip clients too small for the math to be meaningful */

export async function GET(req: Request) {
  const url = new URL(req.url)
  const querySecret = url.searchParams.get('secret')
  const headerSecret = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  const isVercelCron = req.headers.get('user-agent')?.includes('vercel-cron')
  if (!isVercelCron && querySecret !== CRON_SECRET && headerSecret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  /* Every distinct client_id that has GA data in the last 30 days. */
  const since = new Date()
  since.setUTCDate(since.getUTCDate() - 30)
  const { data: rows } = await admin
    .from('website_metrics')
    .select('client_id')
    .gte('date', since.toISOString().slice(0, 10))
  const clientIds = Array.from(new Set((rows ?? []).map(r => r.client_id as string)))

  let notified = 0
  const skipped: string[] = []

  for (const clientId of clientIds) {
    /* Load the last 15 days of visitor counts. Yesterday + 14-day
       baseline. Today often has incomplete data so we use yesterday
       as the candidate. */
    const startStr = new Date(Date.now() - 16 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const { data: hist } = await admin
      .from('website_metrics')
      .select('date, visitors')
      .eq('client_id', clientId)
      .gte('date', startStr)
      .order('date', { ascending: false })
    const series = (hist ?? []) as Array<{ date: string; visitors: number | null }>
    if (series.length < 4) { skipped.push(`${clientId}: not enough history`); continue }

    /* Yesterday's count is the second-most-recent row (today's row
       may be in-progress or missing). */
    const today = new Date().toISOString().slice(0, 10)
    const candidates = series.filter(r => r.date !== today)
    if (candidates.length === 0) continue
    const yesterday = candidates[0]
    const baseline = candidates.slice(1, 15)  /* 14-day window before yesterday */
    if (baseline.length < 7) { skipped.push(`${clientId}: baseline too short`); continue }

    const baselineSorted = baseline
      .map(r => r.visitors ?? 0)
      .sort((a, b) => a - b)
    const median = baselineSorted[Math.floor(baselineSorted.length / 2)]
    const yvis = yesterday.visitors ?? 0

    if (median < MIN_BASELINE_VISITORS) { skipped.push(`${clientId}: baseline too small`); continue }

    let direction: 'drop' | 'spike' | null = null
    let pct = 0
    if (yvis <= median * (1 - DROP_THRESHOLD)) {
      direction = 'drop'
      pct = Math.round(((median - yvis) / median) * 100)
    } else if (yvis >= median * SPIKE_THRESHOLD) {
      direction = 'spike'
      pct = Math.round(((yvis - median) / median) * 100)
    }
    if (!direction) continue

    /* Dedupe: skip if we already notified the same direction within
       DEDUPE_WINDOW_DAYS. */
    const cutoff = new Date()
    cutoff.setUTCDate(cutoff.getUTCDate() - DEDUPE_WINDOW_DAYS)
    const { data: recent } = await admin
      .from('notifications')
      .select('body, created_at')
      .eq('type', 'traffic_anomaly')
      .gte('created_at', cutoff.toISOString())
      .limit(50)
    const alreadyForDirection = (recent ?? []).some(r => {
      const body = (r.body as string | null) ?? ''
      return body.includes(`client:${clientId}`) && body.includes(`direction:${direction}`)
    })
    if (alreadyForDirection) continue

    /* Notify every user attached to this client (owners). */
    const { data: owners } = await admin
      .from('businesses')
      .select('owner_id')
      .eq('client_id', clientId)
    const userIds = (owners ?? []).map(o => o.owner_id as string).filter(Boolean)
    const title = direction === 'drop'
      ? `Traffic dropped ${pct}% yesterday`
      : `Traffic spiked ${pct}% yesterday`
    const body = direction === 'drop'
      ? `Yesterday saw ${yvis} visitors vs the recent median of ${median}. Check whether your site is reachable and that recent content is working. (client:${clientId} direction:${direction})`
      : `Yesterday saw ${yvis} visitors vs the recent median of ${median}. Something is working — find out what so you can do it again. (client:${clientId} direction:${direction})`
    for (const uid of userIds) {
      await createNotification({
        userId: uid,
        kind: 'traffic_anomaly',
        title, body,
        link: '/dashboard/website/traffic',
      })
      notified++
    }
  }

  return NextResponse.json({
    ok: true,
    clientsChecked: clientIds.length,
    notified,
    skipped: skipped.length > 0 ? skipped : undefined,
  })
}
