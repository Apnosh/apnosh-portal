/**
 * Vercel Cron: per-client Google Business Profile sync.
 *
 * The original gbp-api-sync cron uses a single agency-wide token from
 * `integrations.google_business` to enumerate every location across
 * every client. That model only works when one agency Google account
 * is a manager on every client's listing.
 *
 * This cron is the per-client variant: walk every active
 * `channel_connections` row where channel='google_business_profile',
 * call syncClientGbp() for it, and stamp last_sync_at + sync_error.
 * Each client uses its own OAuth token, so the agency model isn't
 * required.
 *
 * Schedule: runs daily after the agency sync so per-client connections
 * always get refreshed too. Manual trigger: ?secret=$CRON_SECRET.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { syncClientGbp } from '@/lib/gbp-client-sync'

export const runtime = 'nodejs'
export const maxDuration = 300  /* 5 minutes — covers many clients */

const CRON_SECRET = process.env.CRON_SECRET

export async function GET(req: Request) {
  const url = new URL(req.url)
  const querySecret = url.searchParams.get('secret')
  const headerSecret = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  const isVercelCron = req.headers.get('user-agent')?.includes('vercel-cron')

  if (!isVercelCron && querySecret !== CRON_SECRET && headerSecret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const { data: rows } = await admin
    .from('channel_connections')
    .select('id, client_id, platform_account_name')
    .eq('channel', 'google_business_profile')
    .eq('status', 'active')

  const connections = (rows ?? []) as Array<{ id: string; client_id: string; platform_account_name: string | null }>

  const outcomes: Array<{
    clientId: string
    locationName: string | null
    ok: boolean
    metricsImported?: number
    reviewsImported?: number
    error?: string
  }> = []

  for (const conn of connections) {
    try {
      const r = await syncClientGbp(conn.client_id)
      outcomes.push({
        clientId: conn.client_id,
        locationName: conn.platform_account_name,
        ok: r.ok,
        metricsImported: r.metricsImported,
        reviewsImported: r.reviewsImported,
        error: r.ok ? undefined : r.message,
      })
    } catch (err) {
      outcomes.push({
        clientId: conn.client_id,
        locationName: conn.platform_account_name,
        ok: false,
        error: (err as Error).message,
      })
    }
  }

  return NextResponse.json({
    ok: true,
    connectionsAttempted: connections.length,
    outcomes,
  })
}
