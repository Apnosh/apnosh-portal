/**
 * AYRSHARE ADAPTER — the rented social pipe, FOR REAL (CHANNELS-PLAN P3).
 *
 * DECIDED (memory: project_integrations_strategy): Ayrshare is the solution, not a
 * stopgap. Screens never read this vendor directly — swap-out is this one file.
 *
 * The lane:
 *   connect — one Ayrshare user profile per client (profileKey stored server-side on
 *             the channel_connections row), then the owner is sent to Ayrshare's
 *             HOSTED linking page (JWT flow) to link Instagram / Facebook / TikTok /
 *             LinkedIn themselves. No tokens ever touch our UI.
 *   sync    — the nightly engine pulls account analytics per linked platform into the
 *             canonical social_metrics table (client_id, platform, date unique), which
 *             Insights, Home, and the social hub already read. followers_gained is
 *             computed against the last stored followers_total, never guessed.
 *
 * Env (fail closed, law 3):
 *   AYRSHARE_API_KEY          — the account key; without it every surface says
 *                               "not set up" and nothing calls out
 *   AYRSHARE_DOMAIN           — the Business Plan domain id for hosted linking
 *   AYRSHARE_PRIVATE_KEY_B64  — the RSA private key Ayrshare issues, base64 encoded
 *                               so it survives env storage; only generateJWT sees it
 */

import { ChannelError, type ChannelAdapter, type ChannelConnection, type ConnectStart, type SyncResult } from '../types'
import { createAdminClient } from '@/lib/supabase/admin'

const API = 'https://api.ayrshare.com/api'

/** The platforms our canonical table accepts (migration 026 CHECK constraint). */
export const AYRSHARE_PLATFORMS = ['instagram', 'facebook', 'tiktok', 'linkedin', 'youtube'] as const
export type AyrsharePlatform = (typeof AYRSHARE_PLATFORMS)[number]

export interface MappedMetrics {
  reach: number
  impressions: number
  profile_visits: number
  followers_total: number
  engagement: number
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : 0)

/**
 * PURE mapper from one platform's Ayrshare analytics object to our canonical columns.
 * Vendors rename fields per network, so this reads every known alias and falls back to
 * zero — a missing metric is an honest zero, never a guess. Sim-locked.
 */
export function mapSocialAnalytics(a: Record<string, unknown> | null | undefined): MappedMetrics {
  const o = (a ?? {}) as Record<string, unknown>
  /* Aliases are the DOCUMENTED per-network field names (Ayrshare analytics docs,
   * checked 2026-08-10): IG followersCount/reachCount/viewsCount/shareCount ·
   * FB fanCount/pagePostEngagements (impressions family retired by Meta) ·
   * TikTok viewCountTotal/likeCountTotal/commentCountTotal/shareCountTotal/profileViews ·
   * LinkedIn impressionCount/commentCount + nested followers.totalFollowerCount. */
  const followersObj = (o.followers && typeof o.followers === 'object' ? (o.followers as Record<string, unknown>) : {})
  const followers =
    num(o.followersCount) || num(o.followerCount) || num(o.fanCount) ||
    num(followersObj.totalFollowerCount) || num(o.followers)
  const impressions =
    num(o.impressionsCount) || num(o.impressionCount) || num(o.impressions) ||
    num(o.viewsCount) || num(o.viewCountTotal) || num(o.views)
  const reach = num(o.reachCount) || num(o.reach)
  const visits = num(o.profileViewsCount) || num(o.profileViews) || num(o.profileVisits)
  const engagement =
    num(o.engagementCount) || num(o.totalInteractions) || num(o.pagePostEngagements) ||
    (num(o.likeCount) || num(o.likeCountTotal)) +
    (num(o.commentsCount) || num(o.commentCount) || num(o.commentCountTotal)) +
    (num(o.sharesCount) || num(o.shareCount) || num(o.shareCountTotal))
  return { reach, impressions, profile_visits: visits, followers_total: followers, engagement }
}

async function ayr(path: string, init: RequestInit & { profileKey?: string } = {}): Promise<Record<string, unknown>> {
  const key = process.env.AYRSHARE_API_KEY
  if (!key) throw new ChannelError('not_configured', 'AYRSHARE_API_KEY is not set')
  const { profileKey, ...rest } = init
  const r = await fetch(`${API}${path}`, {
    ...rest,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(profileKey ? { 'Profile-Key': profileKey } : {}),
      ...(rest.headers ?? {}),
    },
  })
  const j = (await r.json().catch(() => ({}))) as Record<string, unknown>
  if (r.status === 401 || r.status === 403) throw new ChannelError('auth', `Ayrshare rejected our key on ${path}`)
  if (r.status === 429) throw new ChannelError('rate_limit', 'Ayrshare throttled us; the next run retries')
  if (!r.ok) throw new ChannelError('upstream', `Ayrshare ${path} returned ${r.status}: ${String(j.message ?? '').slice(0, 140)}`)
  return j
}

/** Create (or reuse) the client's Ayrshare profile; returns the profileKey. */
async function ensureProfile(clientId: string): Promise<string> {
  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('channel_connections')
    .select('id, access_token')
    .eq('client_id', clientId)
    .eq('channel', 'ayrshare')
    .maybeSingle()
  if (existing?.access_token) return existing.access_token as string

  const created = await ayr('/profiles', {
    method: 'POST',
    body: JSON.stringify({ title: `apnosh-${clientId.slice(0, 8)}` }),
  })
  const profileKey = String(created.profileKey ?? '')
  if (!profileKey) throw new ChannelError('upstream', 'Ayrshare did not return a profileKey')

  const row = {
    client_id: clientId,
    channel: 'ayrshare',
    connection_type: 'hosted_link',
    platform_account_id: created.refId ? String(created.refId) : null,
    access_token: profileKey,
    status: 'pending',
    metadata: { platforms: [] as string[] },
  }
  /* A silent write failure here strands the whole lane (the constraint bug that hid
   * the owner's first live connect) — fail LOUD. */
  const { error } = existing?.id
    ? await admin.from('channel_connections').update(row).eq('id', existing.id)
    : await admin.from('channel_connections').insert(row)
  if (error) throw new ChannelError('upstream', `Could not save the connection: ${error.message}`)
  return profileKey
}

export const ayrshareAdapter: ChannelAdapter = {
  id: 'ayrshare',
  kind: 'hosted_link',

  isConfigured() {
    return Boolean(process.env.AYRSHARE_API_KEY)
  },

  /** hosted_link lane: the start route passes the RAW clientId (no OAuth state — the
   *  linking happens on Ayrshare's page and the nightly sync notices the result). */
  async connectStart(clientId: string): Promise<ConnectStart> {
    if (!this.isConfigured()) throw new ChannelError('not_configured', 'AYRSHARE_API_KEY is not set')
    const domain = process.env.AYRSHARE_DOMAIN
    const keyB64 = process.env.AYRSHARE_PRIVATE_KEY_B64
    if (!domain || !keyB64) {
      throw new ChannelError('not_configured', 'Hosted linking needs AYRSHARE_DOMAIN and AYRSHARE_PRIVATE_KEY_B64 set')
    }
    const profileKey = await ensureProfile(clientId)
    const jwt = await ayr('/profiles/generateJWT', {
      method: 'POST',
      body: JSON.stringify({
        domain,
        privateKey: Buffer.from(keyB64, 'base64').toString('utf8'),
        profileKey,
        redirect: 'https://portal.apnosh.com/dashboard/connected-accounts',
      }),
    })
    const url = String(jwt.url ?? '')
    if (!url) throw new ChannelError('upstream', 'Ayrshare did not return a linking URL')
    return { url, instructions: 'Link your Instagram, Facebook, TikTok, or LinkedIn on the page that opens. Numbers start flowing the next morning.' }
  },

  async sync(connection: ChannelConnection): Promise<SyncResult> {
    if (!this.isConfigured()) throw new ChannelError('not_configured', 'AYRSHARE_API_KEY is not set')
    const profileKey = connection.access_token
    if (!profileKey) throw new ChannelError('not_connected', 'No Ayrshare profile on this connection yet')

    // Which networks has the owner actually linked on Ayrshare's page?
    const user = await ayr('/user', { method: 'GET', profileKey })
    const active = (Array.isArray(user.activeSocialAccounts) ? user.activeSocialAccounts : [])
      .map((p) => String(p).toLowerCase())
      .filter((p): p is AyrsharePlatform => (AYRSHARE_PLATFORMS as readonly string[]).includes(p))
    const admin = createAdminClient()
    if (active.length === 0) {
      await admin.from('channel_connections')
        .update({ status: 'pending', metadata: { platforms: [] } })
        .eq('id', connection.id)
      throw new ChannelError('not_connected', 'No social account linked on Ayrshare yet')
    }

    const analytics = await ayr('/analytics/social', {
      method: 'POST',
      profileKey,
      body: JSON.stringify({ platforms: active }),
    })

    const today = new Date().toISOString().slice(0, 10)
    let written = 0
    for (const platform of active) {
      const node = analytics[platform] as Record<string, unknown> | undefined
      const raw = (node?.analytics ?? node) as Record<string, unknown> | undefined
      if (!raw) continue
      const m = mapSocialAnalytics(raw)

      // followers_gained: today's total minus the last stored total, never negative,
      // and only when both sides are real numbers (no fabricated growth).
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
      const gained = m.followers_total > 0 && prevTotal > 0 ? Math.max(0, m.followers_total - prevTotal) : 0

      const { error } = await admin.from('social_metrics').upsert(
        {
          client_id: connection.client_id,
          platform,
          date: today,
          reach: m.reach,
          impressions: m.impressions,
          profile_visits: m.profile_visits,
          followers_total: m.followers_total,
          followers_gained: gained,
          engagement: m.engagement,
          raw_data: raw,
        },
        { onConflict: 'client_id,platform,date' },
      )
      if (error) throw new ChannelError('upstream', `social_metrics write failed: ${error.message}`)
      written++
    }

    await admin.from('channel_connections')
      .update({ status: 'active', metadata: { platforms: active } })
      .eq('id', connection.id)

    return { itemsWritten: written, note: `${active.join(', ')} synced` }
  },
}
