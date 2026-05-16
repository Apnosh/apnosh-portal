/**
 * Daily Vercel cron: probe every Google channel_connection to detect
 * lost access faster than waiting for the next analytics sync.
 *
 * Wired in vercel.json. Also exposed via ?secret= for manual runs.
 *
 * On state changes (active → error or error → active) writes a
 * notification into the notifications table for the connected_by user.
 */

import { NextResponse } from 'next/server'
import { runConnectionHealthProbe } from '@/lib/connection-health'

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

  const report = await runConnectionHealthProbe()
  return NextResponse.json({ ok: true, ...report })
}
