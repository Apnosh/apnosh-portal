/**
 * GET /api/cron/sync-channels — the channels layer heartbeat (CHANNELS-PLAN P1).
 *
 * Runs the sync engine over every active, registered, configured connection. Guarded by
 * the house three-way cron check (vercel-cron user agent, ?secret=, or Bearer), verbatim
 * from social-sync. Optional ?channel=yelp narrows a run for admin "Sync now".
 */

import { NextResponse } from 'next/server'
import { syncChannels } from '@/lib/channels/sync'

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

  const channel = url.searchParams.get('channel')
  try {
    const run = await syncChannels(channel ? [channel] : undefined)
    return NextResponse.json({ ok: true, ...run })
  } catch (e) {
    /* The engine failing wholesale is itself a loud event: 500 shows in cron logs. */
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
