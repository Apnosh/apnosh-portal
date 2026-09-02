/**
 * Vercel Cron: keep review themes fresh for every client.
 *
 * The theme engine (review-themes.ts) already exists and feeds the campaign
 * planner; it was only ever generated on demand. This runs it nightly for
 * clients with enough review text whose cache is missing or older than 7
 * days, so the monthly report, the complaint-watch card, and the planner
 * all read the same fresh themes. Fails per client silently: no themes
 * means the sections are absent, never wrong.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCachedThemes, generateThemesForClient } from '@/lib/review-themes'

export const runtime = 'nodejs'
export const maxDuration = 300

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
  const since = new Date(); since.setUTCDate(since.getUTCDate() - 90)
  const { data: clients } = await admin.from('clients').select('id, name')
  let refreshed = 0, skipped = 0, failed = 0
  for (const c of clients ?? []) {
    const clientId = c.id as string
    try {
      const { count } = await admin
        .from('reviews').select('id', { count: 'exact', head: true })
        .eq('client_id', clientId).gte('created_at', since.toISOString())
        .not('review_text', 'is', null)
      if ((count ?? 0) < 5) { skipped++; continue }
      const cached = await getCachedThemes(clientId, null, 7).catch(() => null)
      if (cached) { skipped++; continue }
      await generateThemesForClient(clientId, null)
      refreshed++
    } catch (e) {
      failed++
      console.error('[review-themes-refresh] client failed:', clientId, (e as Error).message)
    }
  }
  return NextResponse.json({ ok: true, clients: clients?.length ?? 0, refreshed, skipped, failed })
}
