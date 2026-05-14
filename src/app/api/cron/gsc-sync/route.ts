/**
 * Daily Vercel cron: pull the last 7 days of Google Search Console
 * metrics for every active google_search_console connection and
 * upsert into search_metrics.
 */

import { NextResponse } from 'next/server'
import { syncAllSearchConsole } from '@/lib/web-analytics-sync'

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
  const report = await syncAllSearchConsole(Math.max(1, Math.min(90, days)))
  return NextResponse.json({ ok: true, ...report })
}
