/**
 * Vercel Cron: monthly impact recap nudge.
 *
 * Late each month (28th), for every active client that has real Google
 * performance data, drops an in-app notification — "Your {Month} recap is
 * ready" — that deep-links into /dashboard/local-seo/impact. A free,
 * once-a-month reason to come back and see what their presence drove.
 *
 * In-app only for now (no email provider wired). Idempotent per month: it
 * won't double-notify a user who already got this month's recap.
 *
 * Runs on the 28th (not the 1st) on purpose: the impact page shows the
 * CURRENT month so far, so by the 28th the month is essentially complete.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getImpactSummary } from '@/lib/dashboard/get-impact-summary'
import { getClientOwnerUserIds } from '@/lib/dashboard/client-owners'
import { createNotification } from '@/lib/notify'

export const runtime = 'nodejs'
export const maxDuration = 60

const CRON_SECRET = process.env.CRON_SECRET
const IMPACT_LINK = '/dashboard/local-seo/impact'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const querySecret = url.searchParams.get('secret')
  const headerSecret = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  const isVercelCron = req.headers.get('user-agent')?.includes('vercel-cron')
  if (!isVercelCron && querySecret !== CRON_SECRET && headerSecret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // dryRun: compute who WOULD be notified without inserting anything.
  // clientId: restrict to one client (manual re-send / safe testing).
  const dryRun = url.searchParams.get('dryRun') === '1'
  const onlyClientId = url.searchParams.get('clientId')

  const admin = createAdminClient()
  const now = new Date()
  const monthStartIso = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()

  let q = admin.from('clients').select('id, name').neq('status', 'churned')
  if (onlyClientId) q = q.eq('id', onlyClientId)
  const { data: clients, error } = await q
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  let notified = 0, skippedNoData = 0, skippedAlready = 0
  const outcomes: Array<{ client: string; sent: number; reason?: string }> = []

  for (const c of (clients ?? []) as Array<{ id: string; name: string }>) {
    const summary = await getImpactSummary(c.id)
    if (!summary.hasData) { skippedNoData++; outcomes.push({ client: c.name, sent: 0, reason: 'no-data' }); continue }

    const userIds = await getClientOwnerUserIds(admin, c.id)
    let sentForClient = 0
    for (const userId of userIds) {
      // Idempotency: did this user already get this month's recap?
      const { count } = await admin
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('type', 'report_ready')
        .eq('link', IMPACT_LINK)
        .gte('created_at', monthStartIso)
      if ((count ?? 0) > 0) { skippedAlready++; continue }

      if (!dryRun) {
        await createNotification({
          supabase: admin,
          userId,
          type: 'report_ready',
          title: `Your ${summary.monthLabel} recap is ready`,
          body: 'See what your Google presence drove this month: profile views, calls, directions, and new reviews.',
          link: IMPACT_LINK,
        })
      }
      notified++; sentForClient++
    }
    outcomes.push({ client: c.name, sent: sentForClient })
  }

  return NextResponse.json({ ok: true, dryRun, notified, skippedNoData, skippedAlready, outcomes })
}
