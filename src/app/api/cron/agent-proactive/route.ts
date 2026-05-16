/**
 * Vercel cron: run proactive suggestion detectors and write notifications
 * into the existing notifications table. Owner sees them on next dashboard
 * visit.
 *
 * Cadence is tier-gated:
 *   - ?cadence=daily  → Strategist+ clients only
 *   - ?cadence=weekly → Strategist + Strategist+ clients (default)
 *
 * Wire two cron schedules in vercel.json that hit different cadences.
 * Assistant tier never runs (tier doesn't include proactive insights).
 */

import { NextResponse } from 'next/server'
import { runProactiveSuggestions, type ProactiveCadence } from '@/lib/agent/proactive-suggestions'

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
  const cadenceParam = url.searchParams.get('cadence')
  const cadence: ProactiveCadence = cadenceParam === 'daily' ? 'daily' : 'weekly'
  const report = await runProactiveSuggestions({ cadence })
  return NextResponse.json({ ok: true, cadence, ...report })
}
