/**
 * Daily Vercel cron: pull the last 7 days of GA4 metrics for every
 * active google_analytics connection and upsert into website_metrics.
 *
 * Wired in vercel.json. Runs once daily after GBP cron so token
 * refreshes are recent. Each connection's last_sync_at + sync_status
 * is updated so the Connected Accounts UI can surface health.
 */

import { NextResponse } from 'next/server'
import { syncAllGoogleAnalytics } from '@/lib/web-analytics-sync'

export const dynamic = 'force-dynamic'
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

  const days = Number(url.searchParams.get('days') ?? '7')
  const report = await syncAllGoogleAnalytics(Math.max(1, Math.min(90, days)))
  return NextResponse.json({ ok: true, ...report })
}
