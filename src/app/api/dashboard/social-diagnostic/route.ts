/**
 * /api/dashboard/social-diagnostic — WHY IS THIS PLATFORM SHOWING ZERO?
 *
 * Built after a night of debugging a connected YouTube channel that reported zeros, in which
 * every wrong answer came from reasoning about code instead of looking at what the vendor and
 * the database actually held. There was no way to look. That was the real defect: the pipeline
 * had five places it could come up empty (vendor has no account, vendor has no posts for it,
 * our analytics read misses it, the metrics write fails, the dashboard window excludes it) and
 * all five rendered as the same silent "0".
 *
 * This route asks every stage in order and reports what each one said, in plain words. It is
 * read-only apart from the vendor's own sync-external call, which is the documented way to make
 * native posts appear and is safe to repeat (their side debounces per account).
 *
 * Open it while signed in: /api/dashboard/social-diagnostic
 */

import { NextResponse, type NextRequest } from 'next/server'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const API = 'https://api.zernio.com/v1'

async function zernio(path: string, init: RequestInit = {}): Promise<{ ok: boolean; status: number; body: unknown }> {
  const key = process.env.ZERNIO_API_KEY
  if (!key) return { ok: false, status: 0, body: 'ZERNIO_API_KEY is not set on the server' }
  try {
    const r = await fetch(`${API}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
      cache: 'no-store',
    })
    const body = await r.json().catch(() => null)
    return { ok: r.ok, status: r.status, body }
  } catch (e) {
    return { ok: false, status: 0, body: e instanceof Error ? e.message : 'request failed' }
  }
}

/** Pull the first array we can find under any of these keys, at the top level or under data. */
function listFrom(body: unknown, ...keys: string[]): Record<string, unknown>[] {
  const roots = [body, (body as { data?: unknown } | null)?.data]
  for (const root of roots) {
    if (Array.isArray(root)) return root as Record<string, unknown>[]
    for (const k of keys) {
      const v = (root as Record<string, unknown> | null | undefined)?.[k]
      if (Array.isArray(v)) return v as Record<string, unknown>[]
    }
  }
  return []
}

export async function GET(req: NextRequest) {
  const { user, clientId } = await resolveCurrentClient(req.nextUrl.searchParams.get('clientId'))
  if (!user) return NextResponse.json({ error: 'Sign in first' }, { status: 401 })
  if (!clientId) return NextResponse.json({ error: 'No client context' }, { status: 403 })

  const db = createAdminClient()
  const steps: Record<string, unknown> = {}

  // 1. our connection row
  const { data: conn } = await db
    .from('channel_connections')
    .select('id, status, platform_account_id, metadata, last_sync_at, sync_error, consecutive_failures')
    .eq('client_id', clientId)
    .eq('channel', 'zernio')
    .order('connected_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  steps['1_our_connection'] = conn
    ? {
        status: conn.status,
        profile_id: conn.platform_account_id,
        platforms_we_cached: (conn.metadata as Record<string, unknown> | null)?.platforms ?? null,
        last_sync_at: conn.last_sync_at,
        last_error: conn.sync_error,
        consecutive_failures: conn.consecutive_failures,
      }
    : 'NO ZERNIO CONNECTION ROW — the owner has never completed a social connect for this client.'

  const profileId = conn?.platform_account_id
  if (!profileId) return NextResponse.json({ verdict: 'No vendor profile yet. Connect a social account first.', steps })

  // 2. what the vendor says it holds
  const accountsRes = await zernio(`/accounts?profileId=${encodeURIComponent(profileId)}`)
  const accounts = listFrom(accountsRes.body, 'accounts')
  steps['2_vendor_accounts'] = {
    http: accountsRes.status,
    count: accounts.length,
    accounts: accounts.map((a) => ({
      id: String(a._id ?? a.id ?? ''),
      platform: String(a.platform ?? a.provider ?? a.type ?? ''),
      name: String(a.name ?? a.username ?? a.handle ?? ''),
    })),
    ...(accounts.length === 0 ? { note: 'The vendor holds NO accounts on our profile. The login either did not finish or landed on a different profile.' } : {}),
  }

  // 3. ask the vendor to pull each account's NATIVE posts (the documented on-demand path)
  const external: Record<string, unknown> = {}
  for (const a of accounts) {
    const id = String(a._id ?? a.id ?? '')
    if (!id) continue
    const platform = String(a.platform ?? a.provider ?? a.type ?? id)
    const r = await zernio('/posts/sync-external', { method: 'POST', body: JSON.stringify({ accountId: id }) })
    const posts = listFrom(r.body, 'posts')
    external[platform] = {
      http: r.status,
      posts_found: posts.length,
      ...(r.ok ? {} : { error: r.body }),
      newest: posts[0] ? { published: posts[0].publishedAt ?? posts[0].createdAt ?? null, id: String(posts[0]._id ?? posts[0].id ?? '') } : null,
    }
  }
  steps['3_vendor_native_posts'] = external

  // 4. what the analytics call returns (the read our sync actually folds)
  const from = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  const analyticsRes = await zernio(`/analytics?profileId=${encodeURIComponent(profileId)}&fromDate=${from}&limit=100`)
  const posts = listFrom(analyticsRes.body, 'posts', 'analytics')
  const byPlatform: Record<string, number> = {}
  for (const p of posts) {
    const k = String(p.platform ?? p.provider ?? p.type ?? 'unknown').toLowerCase()
    byPlatform[k] = (byPlatform[k] ?? 0) + 1
  }
  steps['4_analytics_read'] = {
    http: analyticsRes.status,
    total_posts: posts.length,
    posts_per_platform: byPlatform,
    ...(posts.length === 0 ? { note: 'The analytics call returned nothing. Numbers cannot exist downstream of this.' } : {}),
  }

  // 5. what we actually stored
  const { data: metrics } = await db
    .from('social_metrics')
    .select('platform, date, reach, impressions, engagement')
    .eq('client_id', clientId)
    .gte('date', from)
    .order('date', { ascending: false })
  const stored: Record<string, { days: number; reach: number; impressions: number }> = {}
  for (const m of (metrics ?? []) as Record<string, unknown>[]) {
    const k = String(m.platform)
    const s = stored[k] ?? { days: 0, reach: 0, impressions: 0 }
    s.days += 1
    s.reach += Number(m.reach ?? 0)
    s.impressions += Number(m.impressions ?? 0)
    stored[k] = s
  }
  steps['5_what_we_stored'] = Object.keys(stored).length > 0 ? stored : 'No rows in the last 30 days.'

  /* The verdict: name the FIRST stage that came up empty, because that is the one to fix. */
  const linkedPlatforms = accounts.map((a) => String(a.platform ?? a.provider ?? a.type ?? '').toLowerCase())
  let verdict: string
  if (accounts.length === 0) {
    verdict = 'STOPS AT THE VENDOR: no accounts on our profile. The connect did not finish, or the account was linked to a different profile inside the vendor.'
  } else if (posts.length === 0) {
    const pulled = Object.values(external).some((v) => Number((v as { posts_found?: number }).posts_found ?? 0) > 0)
    verdict = pulled
      ? 'STOPS AT THE VENDOR ANALYTICS: they hold your posts but their analytics call returns none yet. Their indexing runs behind the pull; try again shortly.'
      : 'STOPS AT THE VENDOR: the accounts are linked but the vendor has no posts for them yet.'
  } else if (Object.keys(stored).length === 0) {
    verdict = 'STOPS AT OUR WRITE: the vendor returned posts but nothing reached social_metrics. Check last_error in step 1.'
  } else {
    const missing = linkedPlatforms.filter((p) => p && !Object.keys(stored).some((s) => p.startsWith(s) || s.startsWith(p)))
    verdict = missing.length > 0
      ? `PARTIAL: stored numbers for ${Object.keys(stored).join(', ')} but nothing for ${missing.join(', ')}. Compare steps 3 and 4 for those platforms.`
      : 'HEALTHY: every linked platform has stored numbers. A zero on the dashboard is a real zero for the window shown.'
  }

  return NextResponse.json({ verdict, steps }, { headers: { 'Cache-Control': 'no-store' } })
}
