/**
 * Daily Vercel cron: run proactive suggestion detectors for every
 * client and write notifications into the existing notifications
 * table. The owner sees them on next dashboard visit.
 *
 * Wired in vercel.json.
 */

import { NextResponse } from 'next/server'
import { runProactiveSuggestions } from '@/lib/agent/proactive-suggestions'

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
  const report = await runProactiveSuggestions()
  return NextResponse.json({ ok: true, ...report })
}
