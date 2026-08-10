/**
 * ZERNIO ADAPTER — the bake-off challenger to Ayrshare (owner call 2026-08-10).
 *
 * Same law as every adapter: screens read canonical tables, never the vendor; swapping
 * vendors is this one file. The 'social' provider alias in the start route picks the
 * ACTIVE vendor by env (ZERNIO_API_KEY present -> zernio, else ayrshare), so the
 * bake-off is an env change, not a UI change.
 *
 * Zernio's shape (docs.zernio.com, checked 2026-08-10):
 *   profiles  — the tenant boundary, one per client (POST /v1/profiles)
 *   connect   — PER-PLATFORM authUrl: GET /v1/connect/{platform}?profileId&redirect_url
 *               (standard mode: Zernio hosts any page/board selection step)
 *   analytics — per-POST unified shape (GET /v1/analytics: impressions/reach/likes/
 *               comments/shares/saves/clicks/views/follows) + /v1/accounts/follower-stats
 *
 * So the nightly sync builds our daily account rows from two reads: followers from
 * follower-stats, and the day's content totals aggregated from post analytics. NOTE:
 * summed post reach is a CONTENT-reach aggregate, not unique account reach — recorded
 * as such in raw_data; the bake-off judges whether that beats Ayrshare's account-level
 * numbers for our dashboard.
 *
 * UNVERIFIED SHAPES: profiles-create / accounts-list / follower-stats responses are not
 * fully documented publicly; parsing is defensive and the FIRST LIVE RUN on the free
 * account is the verification step (channel_sync_runs shows exactly what happened).
 *
 * Env (fail closed): ZERNIO_API_KEY — that is all (no domain, no RSA key).
 */

import { ChannelError, type ChannelAdapter, type ChannelConnection, type ConnectStart, type SyncResult } from '../types'
import { createAdminClient } from '@/lib/supabase/admin'

const API = 'https://api.zernio.com/v1'
const REDIRECT = 'https://portal.apnosh.com/dashboard/connected-accounts?connected=social'

/** The platforms our canonical table accepts (same constraint as the ayrshare adapter). */
export const ZERNIO_PLATFORMS = ['instagram', 'facebook', 'tiktok', 'linkedin'] as const
export type ZernioPlatform = (typeof ZERNIO_PLATFORMS)[number]

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : 0)
const str = (v: unknown): string => (typeof v === 'string' ? v : '')

export interface ZernioPostRow {
  platform?: string
  analytics?: Record<string, unknown> | null
}

export interface PlatformTotals {
  reach: number
  impressions: number
  engagement: number
}

/**
 * PURE fold: a page of Zernio post-analytics rows -> per-platform daily totals.
 * Missing numbers are honest zeros; unknown platforms are dropped. Sim-locked.
 */
export function aggregateZernioPosts(rows: ZernioPostRow[] | null | undefined): Record<string, PlatformTotals> {
  const out: Record<string, PlatformTotals> = {}
  for (const r of rows ?? []) {
    const platform = str(r?.platform).toLowerCase()
    if (!(ZERNIO_PLATFORMS as readonly string[]).includes(platform)) continue
    const a = (r?.analytics ?? {}) as Record<string, unknown>
    const cur = out[platform] ?? { reach: 0, impressions: 0, engagement: 0 }
    cur.reach += num(a.reach)
    cur.impressions += num(a.impressions) || num(a.views)
    cur.engagement += num(a.likes) + num(a.comments) + num(a.shares) + num(a.saves)
    out[platform] = cur
  }
  return out
}

async function zer(path: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
  const key = process.env.ZERNIO_API_KEY
  if (!key) throw new ChannelError('not_configured', 'ZERNIO_API_KEY is not set')
  const r = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  const j = (await r.json().catch(() => ({}))) as Record<string, unknown>
  if (r.status === 401 || r.status === 403) throw new ChannelError('auth', `Zernio rejected our key on ${path}`)
  if (r.status === 429) throw new ChannelError('rate_limit', 'Zernio throttled us; the next run retries')
  if (!r.ok) throw new ChannelError('upstream', `Zernio ${path} returned ${r.status}: ${String(j.message ?? j.error ?? '').slice(0, 140)}`)
  return j
}

/** Create (or reuse) the client's Zernio profile; returns the profileId. */
async function ensureProfile(clientId: string): Promise<string> {
  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('channel_connections')
    .select('id, platform_account_id')
    .eq('client_id', clientId)
    .eq('channel', 'zernio')
    .maybeSingle()
  if (existing?.platform_account_id) return existing.platform_account_id as string

  const created = await zer('/profiles', {
    method: 'POST',
    body: JSON.stringify({ name: `apnosh-${clientId.slice(0, 8)}` }),
  })
  /* defensive: docs show profile ids like prof_abc123 but the create response shape
   * is not public; accept the common field spellings */
  const profileId =
    str(created.profileId) || str(created.id) ||
    str((created.profile as Record<string, unknown> | undefined)?.id)
  if (!profileId) throw new ChannelError('upstream', 'Zernio did not return a profile id')

  const row = {
    client_id: clientId,
    channel: 'zernio',
    connection_type: 'hosted_link',
    platform_account_id: profileId,
    access_token: null,
    status: 'pending',
    metadata: { platforms: [] as string[] },
  }
  if (existing?.id) await admin.from('channel_connections').update(row).eq('id', existing.id)
  else await admin.from('channel_connections').insert(row)
  return profileId
}

export const zernioAdapter: ChannelAdapter = {
  id: 'zernio',
  kind: 'hosted_link',

  isConfigured() {
    return Boolean(process.env.ZERNIO_API_KEY)
  },

  /** hosted_link lane: raw clientId + the platform the owner tapped (default instagram).
   *  Standard (non-headless) mode: Zernio hosts any page/board selection step. */
  async connectStart(clientId: string, opts?: { platform?: string }): Promise<ConnectStart> {
    if (!this.isConfigured()) throw new ChannelError('not_configured', 'ZERNIO_API_KEY is not set')
    const platform = (opts?.platform ?? 'instagram').toLowerCase()
    if (!(ZERNIO_PLATFORMS as readonly string[]).includes(platform)) {
      throw new ChannelError('upstream', `Unsupported platform: ${platform}`)
    }
    const profileId = await ensureProfile(clientId)
    const res = await zer(`/connect/${platform}?profileId=${encodeURIComponent(profileId)}&redirect_url=${encodeURIComponent(REDIRECT)}`)
    const url = str(res.authUrl)
    if (!url) throw new ChannelError('upstream', 'Zernio did not return an authUrl')
    return { url, instructions: 'Log into the account on the page that opens. Numbers start flowing the next morning.' }
  },

  async sync(connection: ChannelConnection): Promise<SyncResult> {
    if (!this.isConfigured()) throw new ChannelError('not_configured', 'ZERNIO_API_KEY is not set')
    const profileId = connection.platform_account_id
    if (!profileId) throw new ChannelError('not_connected', 'No Zernio profile on this connection yet')
    const admin = createAdminClient()

    // 1. Which accounts are linked? (defensive: accounts may be top-level or nested)
    const accountsRes = await zer(`/accounts?profileId=${encodeURIComponent(profileId)}`)
    const rawAccounts = (Array.isArray(accountsRes.accounts) ? accountsRes.accounts
      : Array.isArray(accountsRes.data) ? accountsRes.data : []) as Record<string, unknown>[]
    const linked = rawAccounts
      .map((a) => str(a.platform).toLowerCase())
      .filter((p): p is ZernioPlatform => (ZERNIO_PLATFORMS as readonly string[]).includes(p))
    if (linked.length === 0) {
      await admin.from('channel_connections')
        .update({ status: 'pending', metadata: { platforms: [] } })
        .eq('id', connection.id)
      throw new ChannelError('not_connected', 'No social account linked on Zernio yet')
    }

    // 2. Followers per platform.
    let followersByPlatform: Record<string, number> = {}
    try {
      const fs = await zer(`/accounts/follower-stats?profileId=${encodeURIComponent(profileId)}`)
      const rows = (Array.isArray(fs.accounts) ? fs.accounts : Array.isArray(fs.data) ? fs.data
        : Array.isArray(fs.stats) ? fs.stats : []) as Record<string, unknown>[]
      for (const r of rows) {
        const p = str(r.platform).toLowerCase()
        const f = num(r.followers) || num(r.followersCount) || num(r.followerCount)
        if (p && f) followersByPlatform[p] = f
      }
    } catch { followersByPlatform = {} /* follower stats missing is a gap, not a failure */ }

    // 3. The day's content totals from post analytics (yesterday -> today window).
    const from = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10)
    const posts = await zer(`/analytics?profileId=${encodeURIComponent(profileId)}&fromDate=${from}&limit=100`)
    const rows = (Array.isArray(posts.posts) ? posts.posts : Array.isArray(posts.data) ? posts.data
      : Array.isArray(posts.analytics) ? posts.analytics : []) as ZernioPostRow[]
    const totals = aggregateZernioPosts(rows)

    // 4. One daily row per linked platform (even a zero day is a real day).
    const today = new Date().toISOString().slice(0, 10)
    let written = 0
    for (const platform of linked) {
      const t = totals[platform] ?? { reach: 0, impressions: 0, engagement: 0 }
      const followersTotal = num(followersByPlatform[platform])

      const { data: prev } = await admin
        .from('social_metrics')
        .select('followers_total')
        .eq('client_id', connection.client_id)
        .eq('platform', platform)
        .lt('date', today)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle()
      const prevTotal = num(prev?.followers_total)
      const gained = followersTotal > 0 && prevTotal > 0 ? Math.max(0, followersTotal - prevTotal) : 0

      const { error } = await admin.from('social_metrics').upsert(
        {
          client_id: connection.client_id,
          platform,
          date: today,
          reach: t.reach,
          impressions: t.impressions,
          profile_visits: 0,
          followers_total: followersTotal,
          followers_gained: gained,
          engagement: t.engagement,
          raw_data: { vendor: 'zernio', note: 'reach is summed post reach, not unique account reach', totals: t },
        },
        { onConflict: 'client_id,platform,date' },
      )
      if (error) throw new ChannelError('upstream', `social_metrics write failed: ${error.message}`)
      written++
    }

    await admin.from('channel_connections')
      .update({ status: 'active', metadata: { platforms: linked } })
      .eq('id', connection.id)

    return { itemsWritten: written, note: `${linked.join(', ')} synced (zernio)` }
  },
}
