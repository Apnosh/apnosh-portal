/**
 * Vercel Cron: check upcoming US restaurant holidays and notify
 * clients whose listings don't have special hours set for them.
 *
 * Runs daily. For each holiday in the next 14 days, looks up every
 * active GBP-connected client, reads their current special hours
 * via v1, and if the holiday date isn't covered, drops a
 * `holiday_hours_reminder` notification on every user attached to
 * that client (owners and managers, not paid_media). Dedupes: only
 * one reminder per (client, holiday) per 7 days.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getClientListing } from '@/lib/gbp-listing'
import { upcomingHolidayDates } from '@/lib/listing-health'
import { createNotification } from '@/lib/notifications'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

const CRON_SECRET = process.env.CRON_SECRET
const WINDOW_DAYS = 14
const DEDUPE_WINDOW_DAYS = 7

export async function GET(req: Request) {
  const url = new URL(req.url)
  const querySecret = url.searchParams.get('secret')
  const headerSecret = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  const isVercelCron = req.headers.get('user-agent')?.includes('vercel-cron')
  if (!isVercelCron && querySecret !== CRON_SECRET && headerSecret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const holidays = upcomingHolidayDates(WINDOW_DAYS)
  if (holidays.length === 0) {
    return NextResponse.json({ ok: true, holidays: 0, notified: 0 })
  }

  /* Distinct active GBP client_ids. */
  const { data: connRows } = await admin
    .from('channel_connections')
    .select('client_id')
    .eq('channel', 'google_business_profile')
    .eq('status', 'active')
    .neq('platform_account_id', 'pending')
  const clientIds = Array.from(new Set((connRows ?? []).map(r => r.client_id as string)))

  let notified = 0
  const errors: Array<{ clientId: string; error: string }> = []

  for (const clientId of clientIds) {
    try {
      const listing = await getClientListing(clientId)
      if (!listing.ok) continue
      const specialDates = new Set((listing.fields.specialHours ?? []).map(s => s.date))
      const missing = holidays.filter(h => !specialDates.has(h.date))
      if (missing.length === 0) continue

      /* Dedupe: skip notifying for a holiday we already nudged the
         client about within DEDUPE_WINDOW_DAYS. */
      const cutoff = new Date()
      cutoff.setUTCDate(cutoff.getUTCDate() - DEDUPE_WINDOW_DAYS)
      const { data: recent } = await admin
        .from('notifications')
        .select('body, created_at')
        .eq('type', 'holiday_hours_reminder')
        .gte('created_at', cutoff.toISOString())
      const alreadyNotified = new Set(
        (recent ?? [])
          .map(r => extractDate(r.body as string | null))
          .filter((d): d is string => !!d),
      )
      const toNotify = missing.filter(h => !alreadyNotified.has(h.date))
      if (toNotify.length === 0) continue

      /* Get every user attached to this client (owner + managers). */
      const { data: profiles } = await admin
        .from('profiles')
        .select('id, role')
        .eq('client_id', clientId)
        .in('role', ['owner', 'manager'])
      const userIds = (profiles ?? []).map(p => p.id as string)

      for (const h of toNotify) {
        const title = `Set hours for ${h.label}`
        const body = `${h.label} is coming up on ${formatDate(h.date)} (date: ${h.date}). Your Google listing doesn't have custom hours set, so it'll show your regular hours by default. Tap to set holiday hours.`
        for (const uid of userIds) {
          await createNotification({
            userId: uid,
            kind: 'holiday_hours_reminder',
            title,
            body,
            link: '/dashboard/local-seo/listing#special-hours',
          })
          notified++
        }
      }
    } catch (err) {
      errors.push({ clientId, error: (err as Error).message })
    }
  }

  return NextResponse.json({
    ok: true,
    holidays: holidays.length,
    clientsChecked: clientIds.length,
    notified,
    errors: errors.length > 0 ? errors : undefined,
  })
}

/* The body string carries the holiday date inside parentheses as
   "date: YYYY-MM-DD" so we can dedupe without a separate column. */
function extractDate(body: string | null): string | null {
  if (!body) return null
  const m = /date:\s*(\d{4}-\d{2}-\d{2})/.exec(body)
  return m ? m[1] : null
}

function formatDate(ymd: string): string {
  return new Date(ymd + 'T00:00:00Z').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })
}
