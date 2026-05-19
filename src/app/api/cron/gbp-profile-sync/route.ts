/**
 * Daily cron: pull GBP profile fields (phone, website, hours,
 * categories, description) into gbp_locations for every active
 * GBP-connected client. Separate from the existing gbp-metrics sync
 * which only touches the metrics table.
 *
 * Wired in vercel.json. Also exposed via ?secret= for manual runs.
 */

import { NextResponse } from 'next/server'
import { syncAllGBPProfiles } from '@/lib/gbp-profile-sync'

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

  const report = await syncAllGBPProfiles()
  return NextResponse.json({ done: true, ...report })
}
