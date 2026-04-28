/**
 * Vercel Cron: pull yesterday's GBP metrics via the official API.
 *
 * Runs daily after the API is ready. Uses the agency-wide token in
 * `integrations.provider = 'google_business'` to enumerate every
 * location and upsert one row per location into gbp_metrics.
 *
 * Replaces the manual monthly CSV uploads once GBP API access is
 * working. Lives alongside /api/cron/gbp-ingest (CSV-from-Drive)
 * as a separate path so a delayed API approval doesn't break the
 * existing CSV pipeline.
 */

import { NextResponse } from 'next/server'
import { syncAgencyMetricsForDate } from '@/lib/gbp-agency'

export const runtime = 'nodejs'
export const maxDuration = 60

const CRON_SECRET = process.env.CRON_SECRET

export async function GET(req: Request) {
  // Same auth pattern as /api/cron/gbp-ingest: vercel-cron header OR
  // explicit ?secret= for manual triggering.
  const url = new URL(req.url)
  const querySecret = url.searchParams.get('secret')
  const headerSecret = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  const isVercelCron = req.headers.get('user-agent')?.includes('vercel-cron')

  if (!isVercelCron && querySecret !== CRON_SECRET && headerSecret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Optional date override for manual backfill: ?date=YYYY-MM-DD
  const dateParam = url.searchParams.get('date') || undefined

  const result = await syncAgencyMetricsForDate(dateParam)
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.message }, { status: 200 })
  }

  return NextResponse.json({
    ok: true,
    date: dateParam || 'yesterday',
    ...result.data,
  })
}
