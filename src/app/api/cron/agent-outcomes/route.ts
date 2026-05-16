/**
 * Daily Vercel cron: attach measured outcomes to recent agent tool
 * executions. Closes the AI-First Principle #2 loop ("outcomes
 * everywhere").
 *
 * Runs on 7-30 days ago window so every executed action gets at
 * least one 7-day post-publish measurement and we can re-run later
 * with longer windows.
 *
 * Wired in vercel.json.
 */

import { NextResponse } from 'next/server'
import { backfillOutcomes } from '@/lib/agent/outcome-tracker'

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
  const minDaysAgo = Number(url.searchParams.get('minDaysAgo') ?? '7')
  const maxDaysAgo = Number(url.searchParams.get('maxDaysAgo') ?? '30')
  const report = await backfillOutcomes({ minDaysAgo, maxDaysAgo })
  return NextResponse.json({ ok: true, ...report })
}
