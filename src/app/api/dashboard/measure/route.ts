/**
 * /api/dashboard/measure — where this client stands on being measurable, and how to fix it.
 *
 * Reads the REAL connection state for Search Console and Analytics from channel_connections.
 * That status is not our word: the daily health cron proves each pipe by reading its actual
 * data path (connection-health.ts), so "connected" here means data is genuinely flowing. The
 * from-scratch case a new client like Shinya is in shows up honestly as "missing".
 *
 * It also sniffs the site's host so the walk-through can give real per-host directions, and
 * hands back the service-account email the owner grants read access to. The reasoning is all in
 * `@/lib/measure/setup` (pure, verified); this route only fetches and hands over.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { createAdminClient } from '@/lib/supabase/admin'
import { getServiceAccountEmail } from '@/lib/google-service-account'
import {
  buildMeasurePlan, hostFromUrl, type HostKey, type MeasureTool, type ToolStatus,
} from '@/lib/measure/setup'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 20

const CHANNEL: Record<'search_console' | 'analytics', string> = {
  search_console: 'google_search_console',
  analytics: 'google_analytics',
}

export async function GET(req: NextRequest) {
  const { user, clientId } = await resolveCurrentClient(req.nextUrl.searchParams.get('clientId'))
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!clientId) return NextResponse.json({ error: 'No client context' }, { status: 403 })

  const db = createAdminClient()
  const [conns, clientRow] = await Promise.all([
    db.from('channel_connections')
      .select('channel, status, sync_error')
      .eq('client_id', clientId)
      .in('channel', [CHANNEL.search_console, CHANNEL.analytics]),
    db.from('clients').select('website').eq('id', clientId).maybeSingle(),
  ])

  // Newest-wins if a client somehow has two rows for a channel: the query is unordered, so fold
  // to the best status per channel rather than trusting row order. active beats error beats none.
  const best = new Map<string, { status: string; sync_error: string | null }>()
  for (const row of conns.data ?? []) {
    const cur = best.get(row.channel)
    const rank = (s: string) => (s === 'active' ? 2 : s === 'error' ? 1 : 0)
    if (!cur || rank(row.status) > rank(cur.status)) best.set(row.channel, { status: row.status, sync_error: row.sync_error })
  }

  const toStatus = (s: string | undefined): ToolStatus =>
    s === 'active' ? 'connected' : s === 'error' ? 'attention' : 'missing'

  const scRow = best.get(CHANNEL.search_console)
  const gaRow = best.get(CHANNEL.analytics)

  const tools: MeasureTool[] = [
    {
      key: 'search_console', label: 'Search Console',
      answers: 'How people find you on Google search',
      status: toStatus(scRow?.status),
      attentionReason: scRow?.status === 'error' ? plainReason(scRow.sync_error) : null,
    },
    {
      key: 'analytics', label: 'Analytics',
      answers: 'What people do once they reach your site',
      status: toStatus(gaRow?.status),
      attentionReason: gaRow?.status === 'error' ? plainReason(gaRow.sync_error) : null,
    },
  ]

  const websiteUrl = (clientRow.data?.website as string | null) ?? null
  const host = await sniffHost(websiteUrl)

  return NextResponse.json(buildMeasurePlan({
    tools,
    websiteUrl,
    host,
    serviceAccountEmail: getServiceAccountEmail(),
  }))
}

/** The stored sync_error is engineer-facing. Pull out the one thing an owner can act on and
 *  drop the stack-trace half. Falls back to a safe generic rather than leaking raw text. */
function plainReason(raw: string | null): string {
  if (!raw) return 'It stopped sending data. Reconnecting usually fixes it.'
  if (/permission|not a user|access/i.test(raw)) return 'Our access was removed. Granting it again turns the data back on.'
  if (/service_account_unavailable/i.test(raw)) return 'A setup issue on our side, not yours. Your team has been told.'
  return 'It stopped sending data. Reconnecting usually fixes it.'
}

/** URL patterns catch the obvious hosts; a header sniff catches custom domains (Wix answers
 *  with a Pepyaka server and an x-wix-request-id header even on a bare domain). Best-effort:
 *  any failure falls back to the URL guess, and then to 'other', which is honest, not wrong. */
async function sniffHost(url: string | null): Promise<HostKey> {
  const fromUrl = hostFromUrl(url)
  if (fromUrl !== 'other' || !url) return fromUrl
  try {
    const res = await fetch(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(6000) })
    const server = (res.headers.get('server') ?? '').toLowerCase()
    const keys = [...res.headers.keys()].join(' ')
    if (keys.includes('x-wix') || server.includes('pepyaka')) return 'wix'
    if (keys.includes('x-squarespace') || server.includes('squarespace')) return 'squarespace'
    if (server.includes('shopify') || keys.includes('x-shopify')) return 'shopify'
    const body = await res.text().catch(() => '')
    if (/wp-content|wp-includes/.test(body)) return 'wordpress'
    if (/squarespace\.com/.test(body)) return 'squarespace'
  } catch { /* fall through to 'other' */ }
  return 'other'
}
