/**
 * Vercel Cron: fetch reviews for every connected client.
 *
 * Q1 wk 5 (1.2). Walks channel_connections for any provider whose
 * Connector implements .sync() and pulls recent reviews into the
 * `reviews` table. Idempotent (upsert on external_id).
 *
 * On new ≤3-star reviews, writes events that surface on the strategist
 * console. The console's "needs attention" score includes these.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getConnector } from '@/lib/integrations/registry'
import type { ConnectionRow } from '@/lib/integrations/types'

export const runtime = 'nodejs'
export const maxDuration = 60

const CRON_SECRET = process.env.CRON_SECRET

interface SyncOutcome {
  connectionId: string
  channel: string
  count?: number
  error?: string
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const querySecret = url.searchParams.get('secret')
  const headerSecret = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  const isVercelCron = req.headers.get('user-agent')?.includes('vercel-cron')

  if (!isVercelCron && querySecret !== CRON_SECRET && headerSecret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()

  // Filter to providers that implement sync() -- right now just GBP.
  // Klaviyo (Q2) + Toast (Q3) will join this list.
  const reviewProviders: string[] = ['google_business_profile']

  const { data: rows, error } = await admin
    .from('channel_connections')
    .select('*')
    .eq('status', 'active')
    .in('channel', reviewProviders)

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  const outcomes: SyncOutcome[] = []
  let totalReviews = 0

  for (const row of (rows ?? []) as ConnectionRow[]) {
    const connector = getConnector(row.channel)
    if (!connector?.sync) {
      outcomes.push({ connectionId: row.id, channel: row.channel, error: 'no sync method' })
      continue
    }

    try {
      const result = await connector.sync(row)
      if (result.ok) {
        await admin
          .from('channel_connections')
          .update({ last_sync_at: new Date().toISOString(), sync_error: null })
          .eq('id', row.id)
        totalReviews += result.count ?? 0
        outcomes.push({ connectionId: row.id, channel: row.channel, count: result.count })
      } else {
        await admin
          .from('channel_connections')
          .update({ sync_error: result.error })
          .eq('id', row.id)
        outcomes.push({ connectionId: row.id, channel: row.channel, error: result.error })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'sync threw'
      await admin
        .from('channel_connections')
        .update({ sync_error: message })
        .eq('id', row.id)
      outcomes.push({ connectionId: row.id, channel: row.channel, error: message })
    }
  }

  return NextResponse.json({
    ok: true,
    totalReviews,
    connections: outcomes.length,
    outcomes,
  })
}
