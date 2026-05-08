/**
 * Vercel Cron: refresh OAuth tokens nearing expiry.
 *
 * Walks every active row in channel_connections and calls the provider's
 * Connector.refresh() if implemented. Connectors decide for themselves
 * whether a refresh is due (the registry handles the policy; this route
 * is just the dispatcher).
 *
 * Outcomes:
 *   - ok + new token        → update access_token / token_expires_at, clear sync_error
 *   - ok + no rotation      → no-op (connector said "not yet")
 *   - error                 → set sync_error, set status='error'
 *   - error + requiresReauth→ status='disconnected' (forces UI prompt)
 *
 * Wired into vercel.json as a daily job.
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getConnector } from '@/lib/integrations/registry'
import type { ConnectionRow } from '@/lib/integrations/types'

export const runtime = 'nodejs'
export const maxDuration = 60

const CRON_SECRET = process.env.CRON_SECRET

interface RefreshOutcome {
  connectionId: string
  channel: string
  status: 'rotated' | 'noop' | 'error' | 'reauth_required' | 'unsupported'
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
  const { data: rows, error: fetchErr } = await admin
    .from('channel_connections')
    .select('*')
    .in('status', ['active', 'error'])

  if (fetchErr) {
    return NextResponse.json({ ok: false, error: fetchErr.message }, { status: 500 })
  }

  const outcomes: RefreshOutcome[] = []

  for (const row of (rows ?? []) as ConnectionRow[]) {
    const connector = getConnector(row.channel)
    if (!connector?.refresh) {
      outcomes.push({ connectionId: row.id, channel: row.channel, status: 'unsupported' })
      continue
    }

    try {
      const result = await connector.refresh(row)

      if (result.ok && result.accessToken && result.expiresAt) {
        const update: Record<string, unknown> = {
          access_token: result.accessToken,
          token_expires_at: result.expiresAt.toISOString(),
          status: 'active',
          sync_error: null,
        }
        if (result.refreshToken) update.refresh_token = result.refreshToken
        await admin.from('channel_connections').update(update).eq('id', row.id)
        outcomes.push({ connectionId: row.id, channel: row.channel, status: 'rotated' })
        continue
      }

      if (result.ok) {
        // Connector said "not in refresh window yet"
        outcomes.push({ connectionId: row.id, channel: row.channel, status: 'noop' })
        continue
      }

      // Failure path
      const newStatus = result.requiresReauth ? 'disconnected' : 'error'
      await admin
        .from('channel_connections')
        .update({ status: newStatus, sync_error: result.error ?? 'Unknown refresh error' })
        .eq('id', row.id)
      outcomes.push({
        connectionId: row.id,
        channel: row.channel,
        status: result.requiresReauth ? 'reauth_required' : 'error',
        error: result.error,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Refresh threw'
      await admin
        .from('channel_connections')
        .update({ status: 'error', sync_error: message })
        .eq('id', row.id)
      outcomes.push({
        connectionId: row.id,
        channel: row.channel,
        status: 'error',
        error: message,
      })
    }
  }

  // Summary counts -- handy in cron logs
  const summary = outcomes.reduce<Record<string, number>>((acc, o) => {
    acc[o.status] = (acc[o.status] ?? 0) + 1
    return acc
  }, {})

  return NextResponse.json({ ok: true, total: outcomes.length, summary, outcomes })
}
