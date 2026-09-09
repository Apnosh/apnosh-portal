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
 *   comments  — GET /v1/inbox/comments and POST /v1/inbox/comments/{id}/reply.
 *               MISSED IN THE AUGUST DOCS READ, which is why the product spent a
 *               month believing comment text needed a direct Meta app. It does
 *               not: the vendor already connected carries comments across every
 *               linked platform. See listComments below.
 *
 * So the nightly sync builds our daily account rows from two reads: followers from
 * follower-stats, and the day's content totals aggregated from post analytics. NOTE:
 * summed post reach is a CONTENT-reach aggregate, not unique account reach — recorded
 * as such in raw_data; the bake-off judges whether that beats Ayrshare's account-level
 * numbers for our dashboard.
 *
 * SHAPES (llms-full.txt + first live run 2026-08-10): profiles create returns
 * { profile: { _id } }; the quickstart reads accounts under data.accounts — so list
 * reads go through unwrapList (top-level key, data array, or data.key). follower-stats
 * is still undocumented; its parse stays defensive and a miss is a gap, not a failure.
 * Any remaining shape miss now throws WITH the response body in the message.
 *
 * Env (fail closed): ZERNIO_API_KEY — that is all (no domain, no RSA key).
 */

import { ChannelError, type ChannelAdapter, type ChannelConnection, type ConnectStart, type SyncResult } from '../types'
import { createAdminClient } from '@/lib/supabase/admin'

const API = 'https://api.zernio.com/v1'
/* Where Zernio sends the owner back after login. Built per call now: the old hardcoded prod
 * constant meant every onboarding connect stranded the owner on the dashboard page (their
 * returnTo was silently ignored) and every dev/preview connect returned to PRODUCTION. The
 * ?connected=social param is load-bearing — the connected-accounts page keys its auto-sync
 * off it — so any custom returnTo keeps it too. */
function redirectUrl(returnTo?: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://portal.apnosh.com').replace(/\/$/, '')
  const path = returnTo && returnTo.startsWith('/') ? returnTo : '/dashboard/connected-accounts'
  return `${base}${path}${path.includes('?') ? '&' : '?'}connected=social`
}

/** The platforms our canonical table accepts (same constraint as the ayrshare adapter). */
export const ZERNIO_PLATFORMS = ['instagram', 'facebook', 'tiktok', 'linkedin', 'youtube'] as const
export type ZernioPlatform = (typeof ZERNIO_PLATFORMS)[number]

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : 0)
const str = (v: unknown): string => (typeof v === 'string' ? v : '')

/** Unwrap a list response that may arrive as {key:[...]}, {data:[...]}, or {data:{key:[...]}}
 *  (Zernio's quickstart shows accounts under data.accounts; other reads vary). */
function unwrapList(res: Record<string, unknown>, ...keys: string[]): Record<string, unknown>[] {
  for (const k of keys) {
    const v = res[k]
    if (Array.isArray(v)) return v as Record<string, unknown>[]
  }
  const d = res.data
  if (Array.isArray(d)) return d as Record<string, unknown>[]
  if (d && typeof d === 'object') {
    for (const k of keys) {
      const v = (d as Record<string, unknown>)[k]
      if (Array.isArray(v)) return v as Record<string, unknown>[]
    }
  }
  return []
}

export interface ZernioPostRow {
  platform?: string
  analytics?: Record<string, unknown> | null
}

export interface PlatformTotals {
  reach: number
  impressions: number
  engagement: number
  /** new followers attributed to posts that day (Zernio per-post 'follows') */
  follows: number
  clicks: number
  saves: number
  shares: number
}

/**
 * PURE fold: a page of Zernio post-analytics rows -> per-platform daily totals.
 * Missing numbers are honest zeros; unknown platforms are dropped. Sim-locked.
 */
/** Normalize a vendor platform value to our canonical four ('instagram-business',
 *  'Facebook Page', etc. all map by prefix); '' when it is none of ours. */
export function normalizePlatform(v: unknown): ZernioPlatform | '' {
  const p = str(v).toLowerCase().replace(/[^a-z]/g, '')
  for (const known of ZERNIO_PLATFORMS) {
    if (p.startsWith(known)) return known
  }
  return ''
}

/** PURE fold: post rows -> per-DAY per-platform totals, so one sync backfills real
 *  daily history instead of collapsing a month into today. Undated rows land on
 *  fallbackDate (today). Sim-locked. */
export function aggregateZernioPostsByDay(
  rows: ZernioPostRow[] | null | undefined,
  fallbackDate: string,
): Record<string, Record<string, PlatformTotals>> {
  const byDay: Record<string, ZernioPostRow[]> = {}
  for (const r of rows ?? []) {
    const o = (r ?? {}) as Record<string, unknown>
    const raw = str(o.publishedAt) || str(o.postedAt) || str(o.posted_at) || str(o.date) || str(o.createdAt) || str(o.created_at)
    const t = Date.parse(raw)
    const day = Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : fallbackDate
    ;(byDay[day] ??= []).push(r)
  }
  const out: Record<string, Record<string, PlatformTotals>> = {}
  for (const [day, group] of Object.entries(byDay)) out[day] = aggregateZernioPosts(group)
  return out
}

export function aggregateZernioPosts(rows: ZernioPostRow[] | null | undefined): Record<string, PlatformTotals> {
  const out: Record<string, PlatformTotals> = {}
  for (const r of rows ?? []) {
    const platform = normalizePlatform(r?.platform)
    if (!platform) continue
    const a = (r?.analytics ?? {}) as Record<string, unknown>
    const cur = out[platform] ?? { reach: 0, impressions: 0, engagement: 0, follows: 0, clicks: 0, saves: 0, shares: 0 }
    cur.reach += num(a.reach)
    /* Views under any of the names vendors use. YouTube reports "Views" and no impressions at
     * all (their Analytics API does not expose impressions), so a fold that only understood
     * `impressions`/`views` stored a zero for a channel with real traffic. Reading the family
     * of names costs nothing and removes a whole class of silent zero. */
    cur.impressions += num(a.impressions)
      || num(a.views) || num(a.viewCount) || num(a.viewsCount) || num(a.view_count)
      || num(a.videoViews) || num(a.plays) || num(a.playCount)
    cur.engagement += num(a.likes) + num(a.comments) + num(a.shares) + num(a.saves)
    cur.follows += num(a.follows)
    cur.clicks += num(a.clicks)
    cur.saves += num(a.saves)
    cur.shares += num(a.shares)
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
  if (r.status === 402) {
    throw new ChannelError('upstream',
      'Zernio says its account limit is full. If your Instagram or Facebook shows connected inside Zernio itself, disconnect it there first (that frees the slot), then tap Connect here again. Relinking the same account uses no extra slots.')
  }
  if (r.status === 429) throw new ChannelError('rate_limit', 'Zernio throttled us; the next run retries')
  if (!r.ok) throw new ChannelError('upstream', `Zernio ${path} returned ${r.status}: ${String(j.message ?? j.error ?? '').slice(0, 140)}`)
  return j
}

/** Create (or reuse) the client's Zernio profile; returns the profileId. */
export interface SocialCommentRow {
  id: string
  platform: string
  postId: string | null
  authorName: string
  text: string
  createdAt: string | null
  /** true once someone has answered it, when the vendor tells us */
  replied: boolean
}

/** The client's Zernio profile id, or null when they have no live connection. */
async function profileIdFor(clientId: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('channel_connections')
    .select('platform_account_id, status')
    .eq('client_id', clientId)
    .eq('channel', 'zernio')
    .maybeSingle()
  const id = (data as { platform_account_id?: string | null } | null)?.platform_account_id
  return typeof id === 'string' && id ? id : null
}

/**
 * COMMENTS ON THIS CLIENT'S POSTS, across every platform they have linked.
 *
 * The one thing the product could not do and several owners said they needed:
 * a food truck's regulars, a cafe's brunch crowd and a business with no website
 * at all all talk to the owner in comments rather than reviews, and none of it
 * reached the product.
 *
 * SHAPE NOTE, and it is the honest caveat on this whole function. The response
 * fields below come from Zernio's published reference, not from a call we have
 * watched: ZERNIO_API_KEY lives only in Vercel, so the shape could not be
 * observed while writing this. Every field is therefore read defensively through
 * several plausible names, an unknown shape yields an empty list rather than a
 * crash, and the diagnostic route reports what actually came back so the FIRST
 * real run confirms or corrects this in one look.
 */
/**
 * What the vendor ACTUALLY sent, described rather than guessed at.
 *
 * listComments returning zero is ambiguous: either there are no comments, or the
 * field names it reads do not match this vendor's. Nothing in a parsed result can
 * tell those apart, so this reports the response's own structure -- the HTTP
 * status, the top-level keys, which key held the array, and the KEY NAMES on the
 * first element. Names only: enough to correct the parser, without dumping
 * customers' comment text through a diagnostic.
 */
export async function diagnoseComments(clientId: string): Promise<Record<string, unknown>> {
  const key = process.env.ZERNIO_API_KEY
  if (!key) return { error: 'ZERNIO_API_KEY is not set' }
  const profileId = await profileIdFor(clientId)
  if (!profileId) return { error: 'This client has no active zernio connection' }

  const out: Record<string, unknown> = { profileId }
  /* Try the documented path first, then the plausible neighbours. A 404 here is
     the most useful single fact: it means the path is wrong, not the parser. */
  for (const path of ['/inbox/comments', '/comments', '/inbox/comment']) {
    const url = `${API}${path}?profileId=${encodeURIComponent(profileId)}&limit=5`
    try {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${key}` } })
      const text = await r.text()
      let json: Record<string, unknown> | null = null
      try { json = JSON.parse(text) as Record<string, unknown> } catch { /* not json */ }
      const arr = json ? unwrapList(json, 'comments', 'items', 'results', 'data') : []
      out[path] = {
        status: r.status,
        topLevelKeys: json ? Object.keys(json).slice(0, 12) : null,
        arrayFound: arr.length,
        firstItemKeys: arr[0] ? Object.keys(arr[0]).slice(0, 25) : null,
        /* Only when nothing parsed, and truncated: the error message is usually
           the whole answer ("no such route", "profileId required"). */
        bodyStart: arr.length === 0 ? text.slice(0, 400) : undefined,
      }
      /* The first level turned out to be the POSTS that have comments
         (accountUsername, commentCount, permalink, picture), not the comments
         themselves. So follow the first id down and describe THAT shape too. */
      if (arr.length > 0) {
        /* Pick a post that HAS comments. The first row happened to have none, and
           an empty array from a post with nothing on it proves nothing. */
        const withComments = arr.find((x) => num(x.commentCount) > 0) ?? arr[0]
        out.postsWithComments = arr.filter((x) => num(x.commentCount) > 0).length
        out.commentCounts = arr.map((x) => num(x.commentCount))
        const firstId = str(withComments.id) || str(withComments._id)
        /* The drill-down told us what it wanted, in its own words:
           {"code":"missing_required_field","param":"accountId"}. The first level
           carries that accountId on every row, so pass it back down. */
        const acct = str(withComments.accountId)
        if (firstId) {
          for (const sub of [`${path}/${encodeURIComponent(firstId)}`]) {
            try {
              const r2 = await fetch(`${API}${sub}?limit=5&accountId=${encodeURIComponent(acct)}`, { headers: { Authorization: `Bearer ${key}` } })
              const t2 = await r2.text()
              let j2: Record<string, unknown> | null = null
              try { j2 = JSON.parse(t2) as Record<string, unknown> } catch { /* not json */ }
              const a2 = j2 ? unwrapList(j2, 'comments', 'items', 'results', 'data') : []
              out[sub] = {
                status: r2.status,
                topLevelKeys: j2 ? Object.keys(j2).slice(0, 12) : null,
                arrayFound: a2.length,
                firstItemKeys: a2[0] ? Object.keys(a2[0]).slice(0, 25) : null,
                bodyStart: a2.length === 0 ? t2.slice(0, 300) : undefined,
              }
              if (a2.length > 0) break
            } catch { /* try the next */ }
          }
        }
        break
      }
    } catch (e) {
      out[path] = { error: e instanceof Error ? e.message : 'fetch failed' }
    }
  }
  return out
}

export async function listComments(clientId: string, limit = 50): Promise<SocialCommentRow[]> {
  const profileId = await profileIdFor(clientId)
  if (!profileId) return []

  /* TWO STEPS, and the first one is not what the name suggests. Confirmed against
     the live API: GET /inbox/comments returns the client's own POSTS that have
     comments on them -- id, accountId, platform, content (the caption),
     commentCount, permalink -- not the comments. The comments live one level
     down, and that sub-resource requires the accountId the first level carries.
     The first parser read the wrong level and quietly returned nothing. */
  const q = new URLSearchParams({ profileId, limit: '50' })
  const res = await zer(`/inbox/comments?${q.toString()}`)
  const posts = unwrapList(res, 'data', 'comments', 'items', 'results')

  /* Only posts that actually have comments, newest first, and bounded: this is a
     fan-out of one request per post and an owner queue does not need every post
     they have ever made. */
  const live = posts
    .filter((p) => num(p.commentCount) > 0 && str(p.id) && str(p.accountId))
    .sort((a, b) => str(b.createdTime).localeCompare(str(a.createdTime)))
    .slice(0, 12)

  const out: SocialCommentRow[] = []
  for (const post of live) {
    const postId = str(post.id)
    const sub = new URLSearchParams({ accountId: str(post.accountId), limit: '25' })
    let rows: Record<string, unknown>[] = []
    try {
      const r = await zer(`/inbox/comments/${encodeURIComponent(postId)}?${sub.toString()}`)
      rows = unwrapList(r, 'comments', 'data', 'items', 'results')
    } catch {
      /* One post failing is not the queue failing. Skip it and keep the rest --
         losing every comment because one post errored would be the worse bug. */
      continue
    }
    for (const c of rows) {
      const id = str(c.id) || str(c._id) || str(c.commentId)
      /* Field names read through several plausible spellings. The post level
         proved the docs and the API disagree (content, not text; createdTime,
         not createdAt), so the comment level is read the same defensive way. */
      const text = str(c.content) || str(c.text) || str(c.message) || str(c.comment)
      if (!id || !text) continue
      const author = c.author && typeof c.author === 'object' ? (c.author as Record<string, unknown>) : {}
      out.push({
        id,
        platform: (str(post.platform) || str(c.platform) || 'instagram').toLowerCase(),
        postId,
        authorName:
          str(c.username) || str(c.from) || str(c.authorName) || str(c.author_name) ||
          str(author.username) || str(author.name) || 'Someone',
        text,
        createdAt: str(c.createdTime) || str(c.createdAt) || str(c.created_at) || str(c.timestamp) || null,
        /* Only true when the vendor says so. An unknown status is NOT "answered":
           showing a comment as handled when it is not is the one error this queue
           cannot make. */
        replied: str(c.status).toLowerCase() === 'replied' || c.replied === true || num(c.replyCount) > 0,
      })
    }
    if (out.length >= limit) break
  }
  return out.slice(0, limit)
}

/** Post a reply to one comment, on whatever platform it came from. */
export async function replyToComment(clientId: string, commentId: string, text: string): Promise<void> {
  const body = text.trim()
  if (!body) throw new ChannelError('upstream', 'A reply cannot be empty')
  const profileId = await profileIdFor(clientId)
  if (!profileId) throw new ChannelError('not_connected', 'This client has no connected social account')
  await zer(`/inbox/comments/${encodeURIComponent(commentId)}/reply`, {
    method: 'POST',
    body: JSON.stringify({ text: body, profileId }),
  })
}

async function ensureProfile(clientId: string, userId?: string): Promise<string> {
  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('channel_connections')
    .select('id, platform_account_id')
    .eq('client_id', clientId)
    .eq('channel', 'zernio')
    .maybeSingle()
  if (existing?.platform_account_id) return existing.platform_account_id as string

  /* Idempotent create: profile names are unique on Zernio (409 on repeat), so first
   * look for OUR name in the list — this recovers a profile whose create response we
   * failed to store (exactly what the first live run did). */
  const name = `apnosh-${clientId.slice(0, 8)}`
  const listed = await zer('/profiles')
  const match = unwrapList(listed, 'profiles').find((p) => str(p.name) === name)
  let profileId = match ? str(match._id) || str(match.id) : ''

  if (!profileId) {
    const created = await zer('/profiles', { method: 'POST', body: JSON.stringify({ name }) })
    /* Documented shape (llms-full.txt, verified after the first live 2xx): the profile
     * comes wrapped under "profile" with a Mongo-style "_id". Older spellings kept as
     * fallbacks; a miss carries the body so the next surprise diagnoses itself. */
    const prof = created.profile as Record<string, unknown> | undefined
    profileId =
      str(prof?._id) || str(prof?.id) || str(created._id) ||
      str(created.profileId) || str(created.id)
    if (!profileId) {
      throw new ChannelError('upstream', `Zernio did not return a profile id (body: ${JSON.stringify(created).slice(0, 200)})`)
    }
  }

  const row = {
    client_id: clientId,
    channel: 'zernio',
    connection_type: 'hosted_link',
    platform_account_id: profileId,
    access_token: null,
    status: 'pending',
    /* connected_by makes the row traceable to a person — the orphan-tenant probe
     * notifies THIS user when the row ends up on a client no login resolves.
     * Without it (all rows before 2026-08-15), the probe finds the orphan but
     * has no one to tell. */
    connected_by: userId ?? null,
    metadata: { platforms: [] as string[] },
  }
  /* A silent write failure here strands the whole lane (the constraint bug that hid
   * the owner's first live connect) — fail LOUD. */
  const { error } = existing?.id
    ? await admin.from('channel_connections').update(row).eq('id', existing.id)
    : await admin.from('channel_connections').insert(row)
  if (error) throw new ChannelError('upstream', `Could not save the connection: ${error.message}`)
  return profileId
}

/**
 * LIVE connection truth: which platforms the vendor holds for this profile, right now.
 *
 * One call, no analytics, no database writes. It exists because the portal used to answer
 * "is YouTube connected?" from `metadata.platforms` — a CACHE that only got rewritten when a
 * whole nightly sync finished. Any failure anywhere in that sync (a constraint, a parse, a
 * failure counter) left the cache stale, and stale renders as "not connected". Four different
 * causes, one identical wrong answer, none of them about the connection.
 *
 * Reading the vendor at display time means our answer cannot drift from theirs: it IS theirs.
 * Returns null when we cannot ask (no key, no profile, vendor down) so the caller can fall
 * back to the cache and say honestly that it is showing the last known state.
 */
/**
 * Pull in posts the owner published NATIVELY (not through us).
 *
 * VERIFIED FROM THE VENDOR'S DOCS, after a newly connected YouTube channel reported zeros
 * while Instagram and TikTok reported real numbers: /analytics covers posts published
 * THROUGH Zernio. Native posts arrive via a background sync that runs "roughly every 90
 * minutes per account", with POST /posts/sync-external to fetch on demand.
 *
 * That is the whole difference. The accounts with numbers had been linked for days, so that
 * background pass had run many times. A freshly linked account has nothing until it runs,
 * which reads to the owner as "connected but all zeros" — a wait dressed up as a bug.
 *
 * So every sync asks for each account's external posts first. Their side debounces per
 * account (~15s) and serves cache when it is warm, so calling it each run is cheap and makes
 * a new connection show real numbers immediately instead of up to an hour and a half later.
 * Best effort: a failure here just means we report what the analytics call already knows.
 */
async function pullExternalPosts(accountIds: string[]): Promise<void> {
  await Promise.all(accountIds.map(async (accountId) => {
    try {
      await zer('/posts/sync-external', { method: 'POST', body: JSON.stringify({ accountId }) })
    } catch { /* one account failing must not cost the others their pull */ }
  }))
}

export async function liveLinkedPlatforms(profileId: string): Promise<{ platforms: string[]; counts: Record<string, number> } | null> {
  if (!process.env.ZERNIO_API_KEY || !profileId) return null
  try {
    let res = await zer(`/accounts?profileId=${encodeURIComponent(profileId)}`)
    let rows = unwrapList(res, 'accounts')
    if (rows.length === 0) {
      try {
        res = await zer(`/profiles/${encodeURIComponent(profileId)}/accounts`)
        rows = unwrapList(res, 'accounts')
      } catch { /* alternate path unsupported */ }
    }
    const counts: Record<string, number> = {}
    for (const a of rows) {
      const p = normalizePlatform(a.platform ?? a.provider ?? a.type)
      if (p) counts[p] = (counts[p] ?? 0) + 1
    }
    return { platforms: Object.keys(counts), counts }
  } catch {
    return null
  }
}

export const zernioAdapter: ChannelAdapter = {
  id: 'zernio',
  kind: 'hosted_link',

  isConfigured() {
    return Boolean(process.env.ZERNIO_API_KEY)
  },

  /** hosted_link lane: raw clientId + the platform the owner tapped (default instagram).
   *  Standard (non-headless) mode: Zernio hosts any page/board selection step. */
  async connectStart(clientId: string, opts?: { platform?: string; returnTo?: string; userId?: string }): Promise<ConnectStart> {
    if (!this.isConfigured()) throw new ChannelError('not_configured', 'ZERNIO_API_KEY is not set')
    const platform = (opts?.platform ?? 'instagram').toLowerCase()
    if (!(ZERNIO_PLATFORMS as readonly string[]).includes(platform)) {
      throw new ChannelError('upstream', `Unsupported platform: ${platform}`)
    }
    const profileId = await ensureProfile(clientId, opts?.userId)
    const res = await zer(`/connect/${platform}?profileId=${encodeURIComponent(profileId)}&redirect_url=${encodeURIComponent(redirectUrl(opts?.returnTo))}`)
    const url = str(res.authUrl) || str((res.data as Record<string, unknown> | undefined)?.authUrl)
    if (!url) {
      throw new ChannelError('upstream', `Zernio did not return an authUrl (body: ${JSON.stringify(res).slice(0, 200)})`)
    }
    return { url, instructions: 'Log into the account on the page that opens. Numbers start flowing the next morning.' }
  },

  async sync(connection: ChannelConnection): Promise<SyncResult> {
    if (!this.isConfigured()) throw new ChannelError('not_configured', 'ZERNIO_API_KEY is not set')
    const profileId = connection.platform_account_id
    if (!profileId) throw new ChannelError('not_connected', 'No Zernio profile on this connection yet')
    const admin = createAdminClient()

    // 1. Which accounts are linked? (documented: the quickstart reads data.accounts;
    //    the multi-tenant docs also mention a profile-scoped path — try both)
    let accountsRes = await zer(`/accounts?profileId=${encodeURIComponent(profileId)}`)
    let rawAccounts = unwrapList(accountsRes, 'accounts')
    if (rawAccounts.length === 0) {
      try {
        accountsRes = await zer(`/profiles/${encodeURIComponent(profileId)}/accounts`)
        rawAccounts = unwrapList(accountsRes, 'accounts')
      } catch { /* alternate path unsupported — keep the first answer */ }
    }
    const linked = [...new Set(rawAccounts
      .map((a) => normalizePlatform(a.platform ?? a.provider ?? a.type))
      .filter((p): p is ZernioPlatform => p !== ''))]
    /* how many accounts per platform (personal + business etc.) — shown honestly
     * on the connected row; totals always combine per platform */
    const accountCounts: Record<string, number> = {}
    for (const a of rawAccounts) {
      const p = normalizePlatform(a.platform ?? a.provider ?? a.type)
      if (p) accountCounts[p] = (accountCounts[p] ?? 0) + 1
    }
    if (linked.length === 0) {
      await admin.from('channel_connections')
        .update({ status: 'pending', metadata: { platforms: [] } })
        .eq('id', connection.id)
      /* Wrong-profile probe: logins done inside Zernio's own dashboard attach to the
       * owner's default workspace profile, not ours. If the workspace-wide list shows
       * accounts our profile can't see, say THAT instead of "not linked". */
      try {
        const all = await zer('/accounts')
        const elsewhere = [...new Set(unwrapList(all, 'accounts')
          .map((a) => normalizePlatform(a.platform ?? a.provider ?? a.type))
          .filter((p) => p !== ''))]
        if (elsewhere.length > 0) {
          const profileName = `apnosh-${connection.client_id.slice(0, 8)}`
          throw new ChannelError('not_connected',
            `Your ${elsewhere.join(' and ')} ${elsewhere.length === 1 ? 'is' : 'are'} linked on Zernio, but under a different profile than ours. In Zernio, move ${elsewhere.length === 1 ? 'it' : 'them'} to the profile named ${profileName} — or unlink there and relink using the Connect buttons here. Relinking the same accounts does not use up extra account slots.`)
        }
      } catch (e) {
        if (e instanceof ChannelError) throw e
        /* workspace probe unsupported — fall through to the diagnostic message */
      }
      /* Carry the raw body: if Zernio DOES have the accounts and we are misreading
       * the shape, this message is the proof and the fix in one. */
      throw new ChannelError('not_connected',
        `Zernio lists no account on our profile yet (their reply: ${JSON.stringify(accountsRes).slice(0, 180)})`)
    }

    /* CONNECTED STATE FIRST. What the vendor holds is known the moment we read the
     * accounts list, so record it here — before any analytics call that could fail.
     *
     * It used to be written at the very END, after every metrics row. That meant one
     * platform's write failing (a YouTube row hitting a CHECK constraint that had not
     * been widened yet, say) aborted the whole sync and left the connection showing
     * NOTHING as connected — including the platforms that were fine. Connection state
     * and metric collection are separate promises, and this is the line between them. */
    const priorMd = ((connection as { metadata?: Record<string, unknown> }).metadata ?? {}) as Record<string, unknown>

    /* ACCOUNT-CHANGE PURGE. Metrics and posts belong to an ACCOUNT, not a platform
     * slot. When the linked account for a platform changes (owner relinks the right
     * login after a wrong one — dosikbbq on the Apnosh profile, 2026-08-20), every
     * stored row from the old account is someone else's data wearing this client's
     * id: the post upsert never removes them (different external_ids) and the delta
     * ledger would baseline against the wrong account's totals. So: remember which
     * account each platform's data came from, and the moment it differs, delete the
     * client's posts + metric history for that platform and drop its lifetime-totals
     * baseline so the new account re-seeds clean on this very sync. */
    /* Identity = id AND username. Zernio REUSES the account _id when a login is
     * reconnected in place (verified live: dosikbbq -> apnoshmedia kept
     * 6a79b32e...), so the id alone misses exactly the swap this purge exists
     * to catch. The username is the part a human changed. */
    const currentIdentity: Record<string, string> = {}
    for (const a of rawAccounts) {
      const pl = normalizePlatform(a.platform ?? a.provider ?? a.type)
      const aid = str(a._id) || str(a.id)
      const aname = (str(a.name) || str(a.username) || str(a.handle)).toLowerCase()
      if (pl && aid && !currentIdentity[pl]) currentIdentity[pl] = `${aid}|${aname}`
    }
    const storedIdentity = (priorMd.account_identity ?? {}) as Record<string, string>
    const changedPlatforms = Object.keys(currentIdentity)
      .filter((pl) => storedIdentity[pl] && storedIdentity[pl] !== currentIdentity[pl])
    for (const pl of changedPlatforms) {
      const { error: e1 } = await admin.from('social_posts').delete()
        .eq('client_id', connection.client_id).eq('platform', pl)
      const { error: e2 } = await admin.from('social_metrics').delete()
        .eq('client_id', connection.client_id).eq('platform', pl)
      if (e1 || e2) {
        /* A half-purged platform would mix two accounts' numbers — worse than stale.
         * Fail the sync loudly; the cron retries. */
        throw new ChannelError('upstream',
          `${pl} account changed but old data could not be cleared: ${(e1 ?? e2)?.message}`)
      }
      const lt = (priorMd.lifetime_totals ?? {}) as Record<string, unknown>
      delete lt[pl]
      priorMd.lifetime_totals = lt
      /* The vendor caches the account's post list too — ask it to re-pull from
       * the platform NOW so the re-seed below reads the new login's posts, not
       * the old account's cached history. Best-effort; their side debounces. */
      const acctId = currentIdentity[pl].split('|')[0]
      try {
        await zer('/posts/sync-external', { method: 'POST', body: JSON.stringify({ accountId: acctId }) })
      } catch { /* re-pull refused — the next background sync catches up */ }
      console.warn(`[zernio sync] ${pl} account changed for client ${connection.client_id} — purged old posts/metrics, re-seeding`)
    }
    priorMd.account_identity = currentIdentity

    await admin.from('channel_connections')
      .update({ status: 'active', metadata: { ...priorMd, platforms: linked, account_counts: accountCounts } })
      .eq('id', connection.id)

    // 2. Followers per platform.
    let followersByPlatform: Record<string, number> = {}
    let followerNote = ''
    try {
      const fs = await zer(`/accounts/follower-stats?profileId=${encodeURIComponent(profileId)}`)
      const rows = unwrapList(fs, 'accounts', 'stats')
      for (const r of rows) {
        const p = normalizePlatform(r.platform)
        /* THE FIELD IS `currentFollowers`. Verified against their OpenAPI spec after every
         * platform reported 0 followers: we were reading followers/followersCount/
         * followerCount, none of which exist on this response, so every account looked like
         * it had no audience. The others stay as fallbacks in case the shape widens. */
        const f = num(r.currentFollowers) || num(r.followers) || num(r.followersCount) || num(r.followerCount)
        if (p && f) followersByPlatform[p] = f
      }
      if (rows.length > 0 && Object.keys(followersByPlatform).length === 0) {
        followerNote = 'follower counts came back empty'
      }
    } catch (e) {
      /* Their follower endpoint can refuse for plan reasons (403 analytics add-on). That is a
       * real answer the owner should see, not a silent zero. */
      followersByPlatform = {}
      followerNote = e instanceof Error ? e.message.slice(0, 120) : 'follower stats unavailable'
    }

    /* Native posts first (see pullExternalPosts): without this a freshly linked account has
     * nothing in /analytics until the vendor's own ~90 minute background pass happens. */
    await pullExternalPosts(rawAccounts
      .map((a) => str(a._id) || str(a.id))
      .filter((id) => id.length > 0))

    // 3. Content totals from post analytics — a 30-day window folded PER DAY, so the
    //    first sync backfills real daily history and the dashboard has numbers now.
    const today = new Date().toISOString().slice(0, 10)
    const from = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
    /* Zernio caps limit at 100 (400 above that, found live). 100 posts covers a
     * month for any restaurant account; a busier profile just backfills less. */
    const posts = await zer(`/analytics?profileId=${encodeURIComponent(profileId)}&fromDate=${from}&limit=100`)
    const rows = unwrapList(posts, 'posts', 'analytics') as ZernioPostRow[]
    const byDay = aggregateZernioPostsByDay(rows, today)

    /* The vendor stamps every analytics row with when IT last refreshed those numbers from
     * the platform (lastUpdated). Platforms refresh on their own clocks — Instagram minutes
     * ago, TikTok hours ago — so keeping the newest per platform lets the dashboard say
     * "as of" per platform instead of implying every number is equally fresh. */
    const freshBy: Record<string, string> = {}
    for (const r of rows) {
      const o = (r ?? {}) as Record<string, unknown>
      const p2 = normalizePlatform(o.platform ?? o.provider ?? o.type)
      if (!p2) continue
      const a = (o.analytics ?? {}) as Record<string, unknown>
      const stamp = str(a.lastUpdated) || str(a.updatedAt) || str(a.last_updated)
      if (stamp && (!freshBy[p2] || stamp > freshBy[p2])) freshBy[p2] = stamp
    }

    /* 3b. Per-POST rows into social_posts — this is what "Recent posts" and the
     * content views read. One row per post, refreshed every sync. */
    const postRows = rows.flatMap((r) => {
      const o = (r ?? {}) as Record<string, unknown>
      const platform = normalizePlatform(o.platform ?? o.provider ?? o.type)
      const externalId = str(o._id) || str(o.id) || str(o.postId) || str(o.latePostId)
      if (!platform || !externalId) return []
      const a = (o.analytics ?? {}) as Record<string, unknown>
      const rawDate = str(o.publishedAt) || str(o.postedAt) || str(o.posted_at) || str(o.date) || str(o.createdAt) || str(o.created_at)
      const t = Date.parse(rawDate)
      /* THE LINK IS `platformPostUrl` (their spec: "Canonical URL (permalink) of the post on
       * the platform"), at the top level and again per platform inside `platforms[]`. We were
       * reading permalink/url/link — none of which their analytics list returns — so most rows
       * stored no link and the card had nothing to open. Null when they genuinely have none,
       * so the UI can say so instead of offering a dead tap. */
      const perPlatform = (Array.isArray(o.platforms) ? o.platforms : []) as Record<string, unknown>[]
      const mine = perPlatform.find((x) => normalizePlatform(x.platform) === platform) ?? perPlatform[0]
      const link = str(o.platformPostUrl) || str(mine?.platformPostUrl)
        || str(o.permalink) || str(o.url) || str(o.link)
      /* Their sync state for this post's numbers: synced | pending | unavailable. A post whose
       * analytics have not synced arrives with zeros, which is NOT the same as a post nobody
       * watched — the owner saw a video with 88 real views reported as 0. Carry the state so
       * the card can say "numbers pending" instead of lying with a zero. */
      const syncState = str(mine?.syncStatus) || str(o.syncStatus) || (o.analytics ? 'synced' : 'pending')
      return [{
        client_id: connection.client_id,
        platform,
        external_id: externalId,
        permalink: link || null,
        media_type: str(o.mediaType) || str(o.media_type) || null,
        caption: (str(o.caption) || str(o.content) || str(o.text) || '').slice(0, 500) || null,
        thumbnail_url: str(o.thumbnailUrl) || str(o.mediaUrl) || str(o.imageUrl) || null,
        posted_at: Number.isFinite(t) ? new Date(t).toISOString() : new Date().toISOString(),
        reach: num(a.reach),
        likes: num(a.likes),
        comments: num(a.comments),
        saves: num(a.saves),
        shares: num(a.shares),
        video_views: num(a.views) || num(a.viewCount) || num(a.viewsCount) || num(a.view_count)
          || num(a.videoViews) || num(a.plays) || num(a.playCount) || num(a.impressions),
        total_interactions: num(a.likes) + num(a.comments) + num(a.shares) + num(a.saves),
        raw_data: { ...o, sync_state: syncState, is_external: o.isExternal ?? null },
        synced_at: new Date().toISOString(),
      }]
    })
    const postWriteFailures: string[] = []
    if (postRows.length > 0) {
      /* PER PLATFORM, NOT ONE BATCH. A single batch meant one poison row from any platform
       * threw before ANY metrics were written — a bad TikTok post silenced Instagram, Facebook,
       * LinkedIn and YouTube for the whole run. Failures are now isolated and NAMED in the sync
       * note, matching the per-platform isolation the metrics writes already have. */
      const postsByPlatform = new Map<string, typeof postRows>()
      for (const row of postRows) {
        const list = postsByPlatform.get(row.platform as string) ?? []
        list.push(row)
        postsByPlatform.set(row.platform as string, list)
      }
      const postFailures: string[] = []
      for (const [pl, rows] of postsByPlatform) {
        const { error: postsErr } = await admin
          .from('social_posts')
          .upsert(rows, { onConflict: 'client_id,platform,external_id' })
        if (postsErr) postFailures.push(`${pl} posts: ${postsErr.message.slice(0, 80)}`)
      }
      if (postFailures.length > 0 && postFailures.length === postsByPlatform.size) {
        throw new ChannelError('upstream', `social_posts write failed for every platform: ${postFailures.join('; ')}`)
      }
      if (postFailures.length > 0) postWriteFailures.push(...postFailures)
    }

    /* 4. One daily row per linked platform — TWO MODES, because the vendor only
     * gives LIFETIME totals per post, never per-day history:
     *
     *   FIRST SYNC for a platform: bucket each post's lifetime totals on its
     *   publish date. That is the only honest history available, and it is
     *   labelled as such — a viral post reads as a spike on the day it went up.
     *
     *   EVERY SYNC AFTER: record only the CHANGE since the last sync, on the
     *   day it actually happened. The old behaviour re-wrote the publish-date
     *   buckets with ever-growing lifetime totals, so a viral video showed
     *   246k views "on Wednesday" and zero after — the owner rightly called
     *   the numbers unbelievable (2026-08-17). Now Wednesday keeps only what
     *   it had when we started tracking, and every day since earns its own.
     *
     * The last-seen lifetime totals per platform live in the connection's
     * metadata (lifetime_totals) and only advance after a successful write, so
     * a failed day is retried, never lost. Deltas floor at zero: the vendor
     * caps the post list at 100, so an old post dropping off the page must
     * read as "no change", not negative.
     *
     * Each platform is written INSIDE its own try: a platform we cannot store
     * must not cost the others their numbers. */
    const lifetimeNow = aggregateZernioPosts(rows)
    const ZERO: PlatformTotals = { reach: 0, impressions: 0, engagement: 0, follows: 0, clicks: 0, saves: 0, shares: 0 }
    const storedTotals = (priorMd.lifetime_totals ?? {}) as Record<string, PlatformTotals>
    const nextTotals: Record<string, PlatformTotals> = { ...storedTotals }
    let written = 0
    const failed: string[] = [...postWriteFailures]
    for (const platform of linked) {
     try {
      const nowTot = lifetimeNow[platform] ?? ZERO
      const stored = storedTotals[platform]
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
      const diffGained = followersTotal > 0 && prevTotal > 0 ? Math.max(0, followersTotal - prevTotal) : 0

      if (!stored) {
        /* FIRST SYNC: publish-date history + today's bucket, as before. */
        for (const [day, dayTotals] of Object.entries(byDay)) {
          if (day === today) continue
          const h = dayTotals[platform]
          if (!h) continue
          const { error: histErr } = await admin.from('social_metrics').upsert(
            {
              client_id: connection.client_id,
              platform,
              date: day,
              reach: h.reach,
              impressions: h.impressions,
              profile_visits: 0,
              followers_gained: h.follows,
              engagement: h.engagement,
              raw_data: { vendor: 'zernio', note: 'first-sync backfill: lifetime post totals bucketed on publish date; reach is summed post reach', totals: h },
            },
            { onConflict: 'client_id,platform,date' },
          )
          if (histErr) throw new ChannelError('upstream', `social_metrics write failed: ${histErr.message}`)
          written++
        }
        const t = byDay[today]?.[platform] ?? ZERO
        const gained = Math.max(t.follows, diffGained)
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
            raw_data: { vendor: 'zernio', note: 'reach is summed post reach, not unique account reach', totals: t, source_updated_at: freshBy[platform] ?? null },
          },
          { onConflict: 'client_id,platform,date' },
        )
        if (error) throw new ChannelError('upstream', `social_metrics write failed: ${error.message}`)
        written++
      } else {
        /* DELTA MODE: only the growth since the last sync, credited to TODAY. */
        const delta = {
          reach: Math.max(0, nowTot.reach - stored.reach),
          impressions: Math.max(0, nowTot.impressions - stored.impressions),
          engagement: Math.max(0, nowTot.engagement - stored.engagement),
          follows: Math.max(0, nowTot.follows - stored.follows),
        }
        const { data: cur } = await admin
          .from('social_metrics')
          .select('reach, impressions, engagement, followers_gained')
          .eq('client_id', connection.client_id)
          .eq('platform', platform)
          .eq('date', today)
          .maybeSingle()
        const gained = Math.max(num(cur?.followers_gained) + delta.follows, diffGained)
        const { error } = await admin.from('social_metrics').upsert(
          {
            client_id: connection.client_id,
            platform,
            date: today,
            reach: num(cur?.reach) + delta.reach,
            impressions: num(cur?.impressions) + delta.impressions,
            profile_visits: 0,
            followers_total: followersTotal,
            followers_gained: gained,
            engagement: num(cur?.engagement) + delta.engagement,
            raw_data: { vendor: 'zernio', note: 'daily growth of post lifetime totals since the last sync; reach is summed post reach', delta, source_updated_at: freshBy[platform] ?? null },
          },
          { onConflict: 'client_id,platform,date' },
        )
        if (error) throw new ChannelError('upstream', `social_metrics write failed: ${error.message}`)
        written++
      }

      /* advance the ledger only after the write landed — and never backwards */
      const base = stored ?? ZERO
      nextTotals[platform] = {
        reach: Math.max(base.reach, nowTot.reach),
        impressions: Math.max(base.impressions, nowTot.impressions),
        engagement: Math.max(base.engagement, nowTot.engagement),
        follows: Math.max(base.follows, nowTot.follows),
        clicks: Math.max(base.clicks ?? 0, nowTot.clicks),
        saves: Math.max(base.saves ?? 0, nowTot.saves),
        shares: Math.max(base.shares ?? 0, nowTot.shares),
      }
     } catch (e) {
       failed.push(`${platform} (${e instanceof Error ? e.message : 'write failed'})`)
     }
    }

    /* Refresh the account counts + the lifetime-totals ledger after the run (the
     * platforms list was already stamped above, so the connection has been showing
     * the truth throughout). */
    await admin.from('channel_connections')
      .update({ status: 'active', metadata: { ...priorMd, platforms: linked, account_counts: accountCounts, lifetime_totals: nextTotals } })
      .eq('id', connection.id)

    const ok = linked.filter((p) => !failed.some((f) => f.startsWith(p)))
    const base = failed.length > 0
      ? `${ok.join(', ') || 'nothing'} synced (zernio). Could not store: ${failed.join('; ')}`
      : `${linked.join(', ')} synced (zernio)`
    const note = followerNote ? `${base}. Followers: ${followerNote}` : base
    return { itemsWritten: written, note }
  },
}
