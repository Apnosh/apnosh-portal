/**
 * Post a reply to one comment, publicly, in the business's name.
 *
 * THE PATH IS THE POST, NOT THE COMMENT. The first version posted to
 * /inbox/comments/{commentId}/reply with {text} and got a flat 405: that route
 * does not exist. The real one is POST /v1/inbox/comments/{postId}, the reply
 * text is `message` not `text`, `accountId` is REQUIRED, and `commentId` is what
 * makes it a reply to a particular comment rather than a new top-level one.
 * Three mistakes in one call, all of them from trusting a documented shape.
 *
 * IDEMPOTENT ON PURPOSE. This posts in public under someone's business name, so
 * a double tap, a retry or a flaky connection must not produce two replies. The
 * key is derived from the comment and the exact text, so the same reply replays
 * the original response instead of posting again, while a genuinely different
 * reply to the same comment still goes through.
 */
export async function replyToComment(
  clientId: string,
  args: { postId: string; accountId: string; commentId: string; text: string },
): Promise<void> {
  const message = args.text.trim()
  if (!message) throw new ChannelError('upstream', 'A reply cannot be empty')
  if (!args.postId || !args.accountId) {
    throw new ChannelError('upstream', 'This comment is missing the post or account it belongs to')
  }
  const profileId = await profileIdFor(clientId)
  if (!profileId) throw new ChannelError('not_connected', 'This client has no connected social account')

  /* A stable fingerprint of exactly this reply. Not random: the whole point is
     that the same send twice is recognised as the same send. */
  let h = 0
  const seed = `${args.commentId}:${message}`
  for (let i = 0; i < seed.length; i++) { h = (h * 31 + seed.charCodeAt(i)) | 0 }
  const idem = `apnosh-${args.commentId}-${(h >>> 0).toString(36)}`

  await zer(`/inbox/comments/${encodeURIComponent(args.postId)}`, {
    method: 'POST',
    headers: { 'Idempotency-Key': idem },
    body: JSON.stringify({ accountId: args.accountId, commentId: args.commentId, message }),
  })
}

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

/** The platforms our canonical METRICS table accepts (same constraint as the
 *  ayrshare adapter). Deliberately unchanged: these five are what social_posts
 *  and social_metrics carry. */
export const ZERNIO_PLATFORMS = ['instagram', 'facebook', 'tiktok', 'linkedin', 'youtube'] as const
export type ZernioPlatform = (typeof ZERNIO_PLATFORMS)[number]

/**
 * The platforms we let a client CONNECT and POST to, which is a longer list than
 * the one we hold metrics for.
 *
 * Google Business Profile is the addition, and it is the highest-value posting
 * surface we were not offering: it takes topicType STANDARD | EVENT | OFFER with
 * a call-to-action button, which for a restaurant is a "2 for 1 Tuesday" with an
 * Order button attached to the listing people actually search. Zernio's own
 * capability matrix lists it as Post: yes, Inbox: yes.
 *
 * KEPT OUT OF ZERNIO_PLATFORMS ON PURPOSE. normalizePlatform() matches by prefix
 * and feeds the metrics fold, and our EXISTING direct Google connection stores
 * channel 'google_business_profile' -- which would start matching 'googlebusiness'
 * and quietly reroute GBP rows into the social metrics path. Two lists, because
 * they answer two different questions.
 */
export const ZERNIO_POSTABLE = [...ZERNIO_PLATFORMS, 'googlebusiness'] as const
export type ZernioPostable = (typeof ZERNIO_POSTABLE)[number]

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

async function zer(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<Record<string, unknown>> {
  const key = process.env.ZERNIO_API_KEY
  if (!key) throw new ChannelError('not_configured', 'ZERNIO_API_KEY is not set')
  /* A vendor call with no deadline is a page that never loads. One slow response
     used to hold the whole comments queue open, because that queue fans out over
     several posts and every one of them waited on this. */
  const r = await fetch(`${API}${path}`, {
    /* Twelve seconds suits a read. It does NOT suit a boost: Zernio's own docs
       say one "can take minutes when Meta requires re-hosting an Instagram
       video", and in the same breath "do not retry on client timeout". Aborting
       at 12s would have shown the owner a failure for an ad that was still being
       created. Callers that need longer say so. */
    signal: AbortSignal.timeout(init.timeoutMs ?? 12000),
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
  /** the connected account the post belongs to; the reply endpoint requires it */
  accountId: string | null
  authorName: string
  text: string
  createdAt: string | null
  /** true once someone has answered it, when the vendor tells us */
  replied: boolean
  /** the vendor's own word on whether this one can be answered at all */
  canReply: boolean
  /** link to the comment on the platform */
  url: string | null
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
export interface PostTarget {
  accountId: string; platform: string; name: string
  /** a Facebook Page id with location data, when this account carries one; the
   *  only thing Instagram accepts as a location and the only one obtainable */
  pageId: string | null
}
export interface BestSlot { dayOfWeek: number; hourUtc: number; posts: number }

/**
 * The accounts this client can actually publish to.
 *
 * `page` and `limit` must be sent TOGETHER -- the API rejects one without the
 * other, which is the sort of thing only a live call tells you.
 */
export async function listPostTargets(clientId: string): Promise<PostTarget[]> {
  const profileId = await profileIdFor(clientId)
  if (!profileId) return []
  const q = new URLSearchParams({ profileId, page: '1', limit: '25' })
  const res = await zer(`/accounts?${q.toString()}`)
  const rows = unwrapList(res, 'accounts', 'data', 'items')
    .map((a) => ({
      accountId: str(a._id) || str(a.id),
      platform: (str(a.platform) || '').toLowerCase(),
      name: str(a.username) || str(a.name) || str(a.displayName) || str(a.platform),
      pageId: null as string | null,
    }))
    .filter((a) => a.accountId && a.platform)

  /* Instagram's locationId is a FACEBOOK PAGE ID with location data, digits only,
     and Zernio has no place search. So a general location picker is not buildable.
     What IS buildable is the case that covers almost everyone: tagging their own
     restaurant, using the page their own Facebook connection already carries.

     THE ACCOUNT ROW DOES NOT CARRY IT. The first version read pageId, page_id,
     platformAccountId and externalId off the account and got null every time,
     because none of those fields exist -- the option was dead on every screen it
     shipped to and looked fine. The page lives behind its own endpoint. */
  const fb = rows.filter((r) => r.platform === 'facebook')
  if (fb.length) {
    await Promise.allSettled(fb.map(async (row) => {
      const r = await zer(`/accounts/${encodeURIComponent(row.accountId)}/facebook-page`)
      const d = (r.data && typeof r.data === 'object' ? r.data : r) as Record<string, unknown>
      const pages = unwrapList(d, 'pages')
      const selected = str(d.selectedPageId)
      const id = /^\d{6,}$/.test(selected) ? selected : str(pages[0]?.id)
      if (/^\d{6,}$/.test(id)) row.pageId = id
    }))
  }
  return rows
}

/**
 * When this account's posts have actually done best, from its own history.
 *
 * Returned raw, in UTC, with the number of posts each slot is based on, because
 * the caller has to be able to refuse a recommendation built on two posts. One
 * account here has a slot averaging 6,561 engagements off six posts, and that
 * average is one viral video wearing a timeslot's name.
 */
export async function bestSlots(clientId: string): Promise<BestSlot[]> {
  const profileId = await profileIdFor(clientId)
  if (!profileId) return []
  try {
    const res = await zer(`/analytics/best-time?profileId=${encodeURIComponent(profileId)}`)
    return unwrapList(res, 'slots', 'data', 'items')
      .map((x) => ({ dayOfWeek: num(x.day_of_week), hourUtc: num(x.hour), posts: num(x.post_count) }))
      .filter((x) => x.posts > 0)
  } catch {
    return []
  }
}

/** A publicly reachable URL to upload one file to, plus the URL it will live at. */
export async function presignMedia(filename: string, contentType: string, size?: number): Promise<{ uploadUrl: string; fileUrl: string }> {
  const res = await zer('/media/presign', {
    method: 'POST',
    body: JSON.stringify({ filename, contentType, ...(size ? { size } : {}) }),
  })
  const d = (res.data && typeof res.data === 'object' ? res.data : res) as Record<string, unknown>
  const uploadUrl = str(d.uploadUrl) || str(d.url) || str(d.signedUrl)
  const fileUrl = str(d.fileUrl) || str(d.publicUrl) || str(d.mediaUrl) || str(d.accessUrl)
  if (!uploadUrl) throw new ChannelError('upstream', 'The vendor did not return an upload URL')
  return { uploadUrl, fileUrl }
}

/**
 * PUBLISH, or schedule for later.
 *
 * `publishNow` and `scheduledFor` are alternatives, not companions -- sending
 * both is asking for two different things. Scheduling carries an IANA timezone,
 * because "Tuesday at 9" without one is a different moment for the owner than it
 * is for the server, and this is exactly the class of bug that made a UTC server
 * and a Pacific browser disagree about which day a campaign settled on.
 *
 * Idempotent for the same reason the replies are: this publishes in public under
 * a business's name, and a double tap must not post twice.
 */
export async function createPost(clientId: string, args: {
  content: string
  targets: Array<{ accountId: string; platform: string }>
  mediaUrls?: string[]
  when: { kind: 'now' } | { kind: 'at'; iso: string; timezone: string }
  /** goes underneath as the first comment; where hashtags belong */
  firstComment?: string
  /** Instagram usernames, up to 3, invited to co-own the post */
  collaborators?: string[]
  /** Instagram usernames tagged in the picture */
  tagged?: string[]
  /** a Facebook Page id with location data */
  locationId?: string | null
  /** TikTok: land in the Creator Inbox instead of publishing, so the owner can
   *  add a trending sound in the app and post it themselves */
  tiktokDraft?: boolean
  /** platform -> its own caption, replacing `content` on that platform only.
   *  LinkedIn reads as a paragraph and Instagram as a line and a wall of tags,
   *  and one caption cannot be both. */
  perPlatform?: Record<string, string>
  /** Stamped on the vendor's copy of the post so a post we sent is
   *  distinguishable from one the owner made in the app. Without it, every
   *  usage question about this feature is unanswerable -- which is exactly the
   *  state we were in: 33 posts observed in 30 days and no way to tell whether
   *  any of them came from here. */
  metadata?: Record<string, unknown>
}): Promise<{ id: string | null }> {
  const content = args.content.trim()
  const everyTargetHasItsOwn = args.targets.length > 0
    && args.targets.every((t) => !!args.perPlatform?.[t.platform]?.trim())
  if (!content && !(args.mediaUrls ?? []).length && !everyTargetHasItsOwn) {
    throw new ChannelError('upstream', 'A post needs something in it')
  }
  if (!args.targets.length) throw new ChannelError('upstream', 'Pick at least one account to post to')
  const profileId = await profileIdFor(clientId)
  if (!profileId) throw new ChannelError('not_connected', 'This client has no connected social account')

  let h = 0
  const own = Object.entries(args.perPlatform ?? {}).filter(([, v]) => v?.trim()).sort().map(([k, v]) => `${k}=${v.trim()}`).join('|')
  const seed = `${content}:${own}:${args.targets.map((t) => t.accountId).sort().join(',')}:${args.when.kind === 'at' ? args.when.iso : 'now'}`
  for (let i = 0; i < seed.length; i++) { h = (h * 31 + seed.charCodeAt(i)) | 0 }

  /* Per-platform data, and only where the platform accepts it. Instagram takes
     the tags, the collaborators and the location; TikTok takes the draft flag;
     Facebook takes its own first comment. Sending a field to a platform that
     does not know it is how a whole post gets rejected for one wrong key. */
  const igExtras: Record<string, unknown> = {}
  if (args.firstComment?.trim()) igExtras.firstComment = args.firstComment.trim()
  if (args.collaborators?.length) igExtras.collaborators = args.collaborators.slice(0, 3)
  if (args.locationId) igExtras.locationId = args.locationId
  if (args.tagged?.length) {
    /* Photos REQUIRE coordinates and Reels ignore them, so a centre point is sent
       for both: it is correct for a photo and harmless for a video. */
    igExtras.userTags = args.tagged.slice(0, 20).map((username) => ({ username, x: 0.5, y: 0.5 }))
  }

  const body: Record<string, unknown> = {
    content,
    platforms: args.targets.map((t) => {
      const per: Record<string, unknown> = {}
      if (t.platform === 'instagram' && Object.keys(igExtras).length) per.platformSpecificData = igExtras
      if (t.platform === 'facebook' && args.firstComment?.trim()) per.platformSpecificData = { firstComment: args.firstComment.trim() }
      if (t.platform === 'tiktok' && args.tiktokDraft) per.platformSpecificData = { draft: true }
      const own = args.perPlatform?.[t.platform]?.trim()
      if (own && own !== content) per.customContent = own
      return { platform: t.platform, accountId: t.accountId, ...per }
    }),
    ...(args.mediaUrls?.length ? { mediaItems: args.mediaUrls.map((url) => ({ url })) } : {}),
    ...(args.when.kind === 'now'
      ? { publishNow: true }
      : { scheduledFor: args.when.iso, timezone: args.when.timezone }),
    ...(args.metadata && Object.keys(args.metadata).length ? { metadata: args.metadata } : {}),
  }
  const res = await zer('/posts', {
    method: 'POST',
    headers: { 'Idempotency-Key': `apnosh-post-${(h >>> 0).toString(36)}` },
    body: JSON.stringify(body),
  })
  const d = (res.data && typeof res.data === 'object' ? res.data : res) as Record<string, unknown>
  return { id: str(d._id) || str(d.id) || str(d.postId) || null }
}

export interface ScheduledPost {
  id: string
  content: string
  status: string
  scheduledFor: string | null
  platforms: string[]
  mediaUrl: string | null
  /** the vendor's own words when a platform refused it */
  failure: string | null
}

/**
 * WHAT IS GOING OUT, AND WHAT DIDN'T.
 *
 * The composer could schedule a post and then there was nowhere to see it, change
 * it or stop it. Scheduling something you cannot then look at is worse than not
 * scheduling it: the owner has handed over a promise and has no way to check it
 * was kept.
 *
 * Failures are carried deliberately. A post that silently did not publish is the
 * single worst outcome here, because the owner believes it went out.
 */
export async function listScheduledPosts(clientId: string, limit = 40): Promise<ScheduledPost[]> {
  const profileId = await profileIdFor(clientId)
  if (!profileId) return []
  const q = new URLSearchParams({ profileId, limit: String(Math.min(100, Math.max(1, limit))), sortBy: 'scheduledFor' })
  const res = await zer(`/posts?${q.toString()}`)
  return unwrapList(res, 'posts', 'data', 'items')
    .map((p) => {
      const plats = Array.isArray(p.platforms) ? (p.platforms as Record<string, unknown>[]) : []
      /* accountId arrives as a populated object here, not the bare id it is on
         the way in. */
      const names = plats.map((x) => {
        const acct = x.accountId && typeof x.accountId === 'object' ? (x.accountId as Record<string, unknown>) : {}
        return (str(x.platform) || str(acct.platform) || '').toLowerCase()
      }).filter(Boolean)
      const failed = plats.find((x) => str(x.status).toLowerCase() === 'failed')
      const media = Array.isArray(p.mediaItems) ? (p.mediaItems as Record<string, unknown>[])[0] : null
      return {
        id: str(p._id) || str(p.id),
        content: str(p.content) || str(p.title),
        status: (str(p.status) || 'unknown').toLowerCase(),
        scheduledFor: str(p.scheduledFor) || str(p.publishedAt) || null,
        platforms: [...new Set(names)],
        mediaUrl: media ? str(media.url) || null : null,
        failure: failed ? (str(failed.error) || str(failed.message) || 'This one did not go out') : null,
      }
    })
    .filter((p) => p.id)
}

/** Call off a post that has not gone out yet. */
export async function cancelScheduledPost(clientId: string, postId: string): Promise<void> {
  if (!postId) throw new ChannelError('upstream', 'No post to cancel')
  const profileId = await profileIdFor(clientId)
  if (!profileId) throw new ChannelError('not_connected', 'This client has no connected social account')
  /* Ownership is checked before this is called: the post must have come back in
     THIS client's own list, so one client can never cancel another's. */
  await zer(`/posts/${encodeURIComponent(postId)}`, { method: 'DELETE' })
}

export interface SocialConversation {
  id: string
  accountId: string
  platform: string
  who: string
  lastMessage: string
  updatedAt: string | null
  unread: number
  url: string | null
}

export interface SocialMessage {
  id: string
  message: string
  senderName: string | null
  /** 'in' = from the customer, 'out' = from the business */
  direction: 'in' | 'out'
  createdAt: string | null
  deleted: boolean
}

/**
 * DIRECT MESSAGES, from the vendor already connected.
 *
 * Written against Zernio's OpenAPI specification rather than its prose docs, and
 * that distinction is the whole story of this integration: the prose was wrong
 * four ways on the comments read and three on the write, while the spec at
 * zernio.com/openapi.json states every path, parameter and field exactly. Found
 * only because a 404 body helpfully named it.
 *
 * Several owners said their customers reach them this way rather than through
 * reviews, and one has no website at all, so her Instagram inbox IS her shop.
 */
export async function listConversations(clientId: string, limit = 30): Promise<SocialConversation[]> {
  const profileId = await profileIdFor(clientId)
  if (!profileId) return []
  const q = new URLSearchParams({ profileId, limit: String(Math.min(100, Math.max(1, limit))), sortOrder: 'desc' })
  const res = await zer(`/inbox/conversations?${q.toString()}`)
  return unwrapList(res, 'data', 'conversations', 'items')
    .map((c) => ({
      id: str(c.id),
      accountId: str(c.accountId),
      platform: (str(c.platform) || 'instagram').toLowerCase(),
      who: str(c.participantName) || str(c.participantUsername) || 'Someone',
      lastMessage: str(c.lastMessage),
      updatedAt: str(c.updatedTime) || null,
      unread: num(c.unreadCount),
      url: str(c.url) || null,
    }))
    .filter((c) => c.id && c.accountId)
}

/** One thread, oldest first, the way a conversation reads. */
export async function listMessages(clientId: string, conversationId: string, accountId: string, limit = 40): Promise<SocialMessage[]> {
  if (!conversationId || !accountId) return []
  /* accountId is a REQUIRED QUERY parameter, not a body field and not optional --
     the API says so in as many words when it is missing. */
  const q = new URLSearchParams({ accountId, limit: String(Math.min(100, Math.max(1, limit))), sortOrder: 'asc' })
  const res = await zer(`/inbox/conversations/${encodeURIComponent(conversationId)}/messages?${q.toString()}`)
  return unwrapList(res, 'messages', 'data', 'items')
    .map((m) => ({
      id: str(m.id),
      message: str(m.message),
      senderName: str(m.senderName) || null,
      /* The spec calls this `direction`. Anything that is not explicitly outbound
         is treated as the customer's, because showing the business's own words as
         a customer's is the worse way to be wrong. */
      direction: (str(m.direction).toLowerCase().startsWith('out') ? 'out' : 'in') as 'in' | 'out',
      createdAt: str(m.createdAt) || null,
      deleted: m.isDeleted === true,
    }))
    .filter((m) => m.id && (m.message || m.deleted))
}

/**
 * Send one message into a conversation. Private, but still in the business's
 * name, so it carries the same idempotency guard the public replies do: a double
 * tap or a retry must not send the customer the same thing twice.
 */
export async function sendMessage(clientId: string, conversationId: string, accountId: string, text: string): Promise<void> {
  const message = text.trim()
  if (!message) throw new ChannelError('upstream', 'A message cannot be empty')
  if (!conversationId || !accountId) throw new ChannelError('upstream', 'This conversation is missing its account')
  const profileId = await profileIdFor(clientId)
  if (!profileId) throw new ChannelError('not_connected', 'This client has no connected social account')
  let h = 0
  const seed = `${conversationId}:${message}`
  for (let i = 0; i < seed.length; i++) { h = (h * 31 + seed.charCodeAt(i)) | 0 }
  await zer(`/inbox/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: 'POST',
    headers: { 'Idempotency-Key': `apnosh-dm-${conversationId}-${(h >>> 0).toString(36)}` },
    body: JSON.stringify({ accountId, message }),
  })
}

/**
 * Describe ANY read endpoint before a parser is written against it.
 *
 * Two rounds on the comments API taught this: the published shapes were wrong
 * four ways on the read and three on the write, and every one was invisible
 * until a real response was in hand. So new endpoints get described first and
 * parsed second. Key NAMES only, never values, so this can never carry a
 * customer's message out through a diagnostic.
 */
export async function describeEndpoint(clientId: string, path: string): Promise<Record<string, unknown>> {
  const key = process.env.ZERNIO_API_KEY
  if (!key) return { error: 'ZERNIO_API_KEY is not set' }
  const profileId = await profileIdFor(clientId)
  if (!profileId) return { error: 'This client has no active zernio connection' }
  /* Read-only by construction: this only ever issues a GET. Discovering a write
     endpoint by trying it would post something in public. */
  const sep = path.includes('?') ? '&' : '?'
  const url = `${API}${path}${sep}profileId=${encodeURIComponent(profileId)}&limit=5`
  try {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(12000) })
    const text = await r.text()
    let json: Record<string, unknown> | null = null
    try { json = JSON.parse(text) as Record<string, unknown> } catch { /* not json */ }
    const arr = json ? unwrapList(json, 'data', 'conversations', 'messages', 'items', 'results', 'accounts', 'slots') : []
    return {
      path,
      status: r.status,
      topLevelKeys: json ? Object.keys(json).slice(0, 12) : null,
      arrayFound: arr.length,
      firstItemKeys: arr[0] ? Object.keys(arr[0]).slice(0, 30) : null,
      /* The first row's id and accountId, so a nested resource can be described
         in the same pass. Identifiers, not content: the comments API needed both
         to reach its second level and would otherwise cost another round trip. */
      firstId: arr[0] ? (str(arr[0].id) || str(arr[0]._id) || null) : null,
      firstAccountId: arr[0] ? (str(arr[0].accountId) || null) : null,
      bodyStart: arr.length === 0 ? text.slice(0, 400) : undefined,
    }
  } catch (e) {
    return { path, error: e instanceof Error ? e.message : 'fetch failed' }
  }
}

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
    .slice(0, 8)

  /* IN PARALLEL, not one after another. This walks a post at a time and the first
     version awaited each one inside the loop, so a client with a dozen commented
     posts paid thirteen round trips end to end and the tab sat there. They do not
     depend on each other, so they go together and the queue costs two round trips
     instead of thirteen.

     allSettled, not all: one post failing is not the queue failing, and losing
     every comment because a single post errored would be the worse bug. */
  const fetched = await Promise.allSettled(live.map(async (post) => {
    const postId = str(post.id)
    const sub = new URLSearchParams({ accountId: str(post.accountId), limit: '25' })
    const r = await zer(`/inbox/comments/${encodeURIComponent(postId)}?${sub.toString()}`)
    return { post, rows: unwrapList(r, 'comments', 'data', 'items', 'results') }
  }))

  const out: SocialCommentRow[] = []
  for (const res of fetched) {
    if (res.status !== 'fulfilled') continue
    const { post, rows } = res.value
    const postId = str(post.id)
    for (const c of rows) {
      const id = str(c.id) || str(c._id) || str(c.commentId)
      /* Field names read through several plausible spellings. The post level
         proved the docs and the API disagree (content, not text; createdTime,
         not createdAt), so the comment level is read the same defensive way. */
      const text = str(c.content) || str(c.text) || str(c.message) || str(c.comment)
      if (!id || !text) continue
      /* `from` is an OBJECT, not a string -- every comment read "Someone" until a
         live response showed it. Handle both, and try the author-ish keys on
         whichever of the two shapes turns up. */
      const fromObj = (v: unknown): Record<string, unknown> =>
        v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
      const who = { ...fromObj(c.author), ...fromObj(c.from) }
      out.push({
        id,
        platform: (str(post.platform) || str(c.platform) || 'instagram').toLowerCase(),
        postId,
        accountId: str(post.accountId) || null,
        authorName:
          str(c.from) || str(c.username) || str(c.authorName) || str(c.author_name) ||
          str(who.username) || str(who.name) || str(who.displayName) || 'Someone',
        text,
        createdAt: str(c.createdTime) || str(c.createdAt) || str(c.created_at) || str(c.timestamp) || null,
        /* Only true when the vendor says so. An unknown status is NOT "answered":
           showing a comment as handled when it is not is the one error this queue
           cannot make. */
        replied: str(c.status).toLowerCase() === 'replied' || c.replied === true || num(c.replyCount) > 0,
        /* The vendor states this per comment. Trust it: offering a Reply button
           on something the platform will refuse is a promise the product cannot
           keep. Absent means yes, since older responses did not carry it. */
        canReply: c.canReply !== false,
        url: str(c.url) || str(c.permalink) || null,
      })
    }
  }
  /* Newest first across every post, then capped. The old code broke out of the
     loop at the limit, which meant the cap was decided by whichever post happened
     to be walked first rather than by what is most recent. */
  out.sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))
  return out.slice(0, limit)
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
    if (!(ZERNIO_POSTABLE as readonly string[]).includes(platform)) {
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

/**
 * WHAT EACH PLATFORM WILL ACCEPT, in characters, from the vendor rather than
 * from memory. LinkedIn, Instagram, X and Threads all cut off at wildly
 * different lengths, and a caption written once for all of them is silently
 * truncated on whichever is strictest.
 *
 * POST /v1/tools/validate/post-length takes {text} and answers per platform with
 * {count, limit, valid}. Called once with a one-character probe, it is a table of
 * limits; the composer then counts as the owner types instead of asking the
 * vendor on every keystroke.
 */
let limitsCache: { at: number; value: Record<string, number> } | null = null
const LIMITS_TTL = 6 * 60 * 60 * 1000

export async function platformTextLimits(): Promise<Record<string, number>> {
  /* Held for six hours in the running process. These are the platforms' own
     rules, not this client's data: asking the vendor for them on every composer
     open and again on every publish was a round trip for a table that changes
     when a platform changes, which is roughly never. */
  if (limitsCache && Date.now() - limitsCache.at < LIMITS_TTL) return limitsCache.value
  try {
    const res = await zer('/tools/validate/post-length', { method: 'POST', body: JSON.stringify({ text: '.' }) })
    const d = (res.data && typeof res.data === 'object' ? res.data : res) as Record<string, unknown>
    const platforms = (d.platforms && typeof d.platforms === 'object' ? d.platforms : {}) as Record<string, unknown>
    const out: Record<string, number> = {}
    for (const [k, v] of Object.entries(platforms)) {
      const limit = num((v as Record<string, unknown>)?.limit)
      if (limit > 0) out[k] = limit
    }
    if (Object.keys(out).length) limitsCache = { at: Date.now(), value: out }
    return out
  } catch {
    /* A failed refresh should not throw away numbers we already have. */
    return limitsCache?.value ?? {}
  }
}

/* ── ADS ─────────────────────────────────────────────────────────────────────
 *
 * THIS IS THE ONLY PART OF THIS FILE THAT SPENDS THE CLIENT'S MONEY, and it is
 * written like it. Every other integration here moves data; a mistake costs a
 * wrong number on a screen. A mistake here costs real money out of a restaurant's
 * ad account, and there is no undo.
 *
 * Four rules, enforced in code rather than trusted to a caller:
 *
 *   1. LIFETIME BUDGETS ONLY, with an end date. A daily budget runs until
 *      somebody stops it, which means a forgotten boost bills every day
 *      forever. A lifetime budget with an end date is bounded by construction:
 *      the worst case is the number the owner already agreed to.
 *   2. A HARD CEILING no request can exceed, checked here and not only in the UI.
 *   3. IDEMPOTENT. A double tap, a retry, or a flaky connection must not buy the
 *      same ad twice. The key is derived from the post, the amount and the days,
 *      so the same boost replays and a genuinely different one goes through.
 *   4. NEVER AUTOMATIC. There is no scheduled boost, no auto-renew, and no
 *      "boost anything over N views" rule in this file, deliberately.
 *
 * Zernio's boost endpoint has no validateOnly and no dryRun, so the first real
 * call is the one that spends. There is no rehearsal.
 */

/**
 * The most a single boost may ever be, whatever the caller asks for.
 *
 * A GUARDRAIL, NOT A PLATFORM LIMIT. Meta's own minimum is $1/day and it has no
 * maximum worth mentioning. This number exists so that a bug, a fat finger or a
 * hostile request body cannot empty an ad account, and it is deliberately a
 * number an owner would notice losing rather than one they would not.
 */
export const MAX_BOOST_USD = 500
/** And the longest it may run. A month is a campaign; longer is a subscription. */
export const MAX_BOOST_DAYS = 30
/** Meta's own floor, below which it will not deliver. */
export const MIN_DAILY_USD = 1

export interface AdAccount {
  id: string
  name: string
  currency: string
  /** Zernio's own judgement that this account can be used. The authority. */
  selectable: boolean
  status: string
  /** Why the platform says it cannot be used, in the platform's words. Present
   *  when a card has bounced, a bill is unsettled, or the account is in review. */
  reason: string | null
  minimumDailyBudget: number
}

/* Meta's account_status is a number. OURS, not the vendor's: a label for a code,
   used only to say something readable next to Zernio's `selectable`, which is
   what actually decides whether we let anyone spend. If this map is wrong the
   worst case is a vaguer sentence, never a wrong permission. */
const META_ACCOUNT_STATUS: Record<string, string> = {
  '1': 'active', '2': 'disabled', '3': 'unsettled', '7': 'in review',
  '8': 'awaiting payment', '9': 'in grace period', '100': 'closing', '101': 'closed',
}

/** The ad accounts a connected posting account can reach. Read-only. */
export async function listAdAccounts(clientId: string, accountId: string): Promise<AdAccount[]> {
  const profileId = await profileIdFor(clientId)
  if (!profileId) return []
  const res = await zer(`/ads/accounts?accountId=${encodeURIComponent(accountId)}`)
  return unwrapList(res, 'accounts', 'data', 'items').map((a) => ({
    id: str(a.id),
    name: str(a.name) || str(a.businessName) || 'Ad account',
    currency: str(a.currency) || 'USD',
    selectable: a.selectable !== false,
    /* accountStatus arrives as a NUMBER on Meta, and str() returns '' for a
       number -- so this read 'unknown' on every account since it was written,
       and nothing checked it anyway. */
    status: (() => {
      const raw = a.accountStatus
      if (typeof raw === 'number') return META_ACCOUNT_STATUS[String(raw)] ?? `status ${raw}`
      const t = str(raw)
      return t ? (META_ACCOUNT_STATUS[t] ?? t.toLowerCase()) : 'unknown'
    })(),
    reason: str(a.unusableReason) || str(a.disableReason) || null,
    minimumDailyBudget: num(a.minimumDailyBudget),
  })).filter((a) => a.id)
}

/**
 * Turn on ads for a platform.
 *
 * A GET, and idempotent: it either reports the ads account already exists or
 * hands back a login URL. Nothing is charged and nothing is created on the ad
 * platform. `adAccountIds` PINS the connection to specific ad accounts, which is
 * the difference between "we can reach one account you chose" and "we can reach
 * every ad account this login can see". Always pass it.
 */
export async function connectAds(
  clientId: string,
  platform: string,
  opts: { accountId?: string; adAccountIds?: string[]; returnTo?: string },
): Promise<{ alreadyConnected: boolean; authUrl: string | null; accountId: string | null; scoped: string[] }> {
  const profileId = await profileIdFor(clientId)
  if (!profileId) throw new ChannelError('not_connected', 'This client has no connected social account')
  const q = new URLSearchParams({ profileId })
  if (opts.accountId) q.set('accountId', opts.accountId)
  for (const id of opts.adAccountIds ?? []) q.append('adAccountIds', id)
  q.set('redirect_url', redirectUrl(opts.returnTo))
  const res = await zer(`/connect/${platform}/ads?${q.toString()}`)
  const d = (res.data && typeof res.data === 'object' ? res.data : res) as Record<string, unknown>
  return {
    alreadyConnected: d.alreadyConnected === true,
    authUrl: str(d.authUrl) || null,
    accountId: str(d.accountId) || null,
    scoped: unwrapList({ data: d.scopedAdAccountIds }, 'data').map((x) => String(x)).filter(Boolean),
  }
}

export interface BoostResult { id: string | null; status: string }

/** Somewhere an ad can be aimed. */
export interface GeoOption {
  key: string; name: string; type: string
  /** "United States, Washington, Seattle" — the only way to tell Wallingford,
   *  Washington from Wallingford, Oxfordshire, both of which this search
   *  returns for the same word. */
  where: string
  /** Whether our targeting spec can actually express this kind of place. */
  targetable: boolean
}

/**
 * The place types Zernio's TargetingSpec can express.
 *
 * Its geo SEARCH returns more than its geo TARGETING accepts: type
 * "neighborhood" and "subcity" come back for a query like "wallingford", and
 * there is no neighbourhoods field on the spec at all. Offering one is offering
 * a place that cannot be aimed at.
 */
export const TARGETABLE_GEO = new Set(['city', 'region', 'zip', 'postal', 'metro', 'dma', 'country'])

/**
 * Places matching a search, as the ad platform knows them.
 *
 * A city has to be resolved to the PLATFORM'S own id before it can be targeted;
 * "Seattle" is not a targeting value, `key` is. This is what makes "how do I
 * know it goes to the right area" answerable with something other than a shrug.
 */
export async function searchGeo(clientId: string, accountId: string, q: string): Promise<GeoOption[]> {
  if (!q.trim()) return []
  const profileId = await profileIdFor(clientId)
  if (!profileId) return []
  try {
    const res = await zer(`/ads/targeting/search?accountId=${encodeURIComponent(accountId)}&dimension=geo&q=${encodeURIComponent(q.trim())}&limit=12`)
    return unwrapList(res, 'results', 'data', 'items', 'options').map((x) => {
      const type = (str(x.type) || str(x.geoType) || 'city').toLowerCase()
      /* `path` is Meta's own breadcrumb for the place. Without it the list shows
         four things called Wallingford and no way to tell them apart. */
      const path = Array.isArray(x.path) ? x.path.map((p) => String(p)) : []
      const where = path.length ? path.slice(0, -1).reverse().join(', ') : (str(x.region) || str(x.country))
      return {
        key: str(x.key) || str(x.id),
        name: str(x.name) || str(x.label),
        type,
        where,
        targetable: TARGETABLE_GEO.has(type),
      }
    }).filter((x) => x.key && x.name)
  } catch { return [] }
}

export interface Reach {
  available: boolean
  lower: number | null
  upper: number | null
  /** Estimated daily reach at the budget, when Meta returns it. */
  daily: number | null
  /** Meta only. False while Meta is still computing: an audience it has not
   *  seen before comes back as zeros until it has. Dropping this field meant
   *  "still working" was indistinguishable from "nobody lives there". */
  ready: boolean | null
  currency: string | null
}

/**
 * How many people this could reach, BEFORE anything is bought.
 *
 * Meta answers this from its own delivery_estimate. Google and TikTok do not
 * have a pre-flight reach API at all and report available:false, which is why
 * this returns a shape that can say "we do not know" rather than a zero that
 * looks like an answer.
 */
export async function reachEstimate(
  clientId: string,
  args: { accountId: string; adAccountId: string; spec: Record<string, unknown> },
): Promise<Reach> {
  const profileId = await profileIdFor(clientId)
  if (!profileId) return { available: false, lower: null, upper: null, daily: null, ready: null, currency: null }
  try {
    const res = await zer('/ads/targeting/reach-estimate', {
      method: 'POST',
      body: JSON.stringify({ accountId: args.accountId, adAccountId: args.adAccountId, spec: args.spec, optimizationGoal: 'REACH' }),
    })
    const d = (res.data && typeof res.data === 'object' ? res.data : res) as Record<string, unknown>
    return {
      available: d.available === true,
      lower: typeof d.lower === 'number' ? d.lower : null,
      upper: typeof d.upper === 'number' ? d.upper : null,
      daily: typeof d.daily === 'number' ? d.daily : null,
      ready: typeof d.estimateReady === 'boolean' ? d.estimateReady : null,
      currency: str(d.currency) || null,
    }
  } catch { return { available: false, lower: null, upper: null, daily: null, ready: null, currency: null } }
}

/**
 * Put money behind a post that already exists.
 *
 * Boosting rather than creating an ad from scratch is the whole point for this
 * audience: the creative is a post whose organic numbers we already hold, so
 * "this one did four times your average" is the entire pitch, and the ad keeps
 * the post's existing likes and comments rather than starting cold.
 */
export async function boostPost(clientId: string, args: {
  /**
   * ZERNIO'S post id, not the platform's.
   *
   * This was wrong first time and would have failed on the first real spend.
   * social_posts.external_id is named as though it holds a Meta or Instagram id;
   * it does not. The sync fills it from `_id` on Zernio's own analytics rows, so
   * every value in that column is a 24-hex Zernio ObjectId. Zernio's boost takes
   * `postId` OR `platformPostId` and they are different fields; we were sending
   * ours in the wrong one.
   */
  zernioPostId: string
  accountId: string
  adAccountId: string
  /** whole currency units, e.g. 20 for $20. Capped here, not by the caller. */
  amount: number
  days: number
  name: string
  /** WHO SEES IT. Not optional in practice: a restaurant ad with no geo is
   *  shown to a whole country, which is money spent on people who will never
   *  walk in. The route refuses to send without one. */
  targeting?: Record<string, unknown>
  /** where a tap on the ad goes; omitted means the post itself */
  linkUrl?: string
  callToAction?: string
}): Promise<BoostResult> {
  const profileId = await profileIdFor(clientId)
  if (!profileId) throw new ChannelError('not_connected', 'This client has no connected social account')

  const amount = Math.round(Number(args.amount) * 100) / 100
  if (!Number.isFinite(amount) || amount < 1) {
    throw new ChannelError('upstream', 'A boost has to be at least $1')
  }
  if (amount > MAX_BOOST_USD) {
    throw new ChannelError('upstream', `A single boost is capped at $${MAX_BOOST_USD}. Run two if you mean it.`)
  }
  const days = Math.round(Number(args.days))
  if (!Number.isFinite(days) || days < 1 || days > MAX_BOOST_DAYS) {
    throw new ChannelError('upstream', `A boost runs between 1 and ${MAX_BOOST_DAYS} days`)
  }
  if (!args.zernioPostId || !args.adAccountId || !args.accountId) {
    throw new ChannelError('upstream', 'A boost needs a post and an ad account')
  }

  const start = new Date()
  const end = new Date(start.getTime() + days * 86400000)

  /* The same post, the same money, the same window is the same purchase. */
  let h = 0
  const seed = `${args.zernioPostId}:${amount}:${days}:${start.toISOString().slice(0, 13)}`
  for (let i = 0; i < seed.length; i++) { h = (h * 31 + seed.charCodeAt(i)) | 0 }

  const res = await zer('/ads/boost', {
    method: 'POST',
    /* Long, because Meta may re-host an Instagram video before the ad exists.
       The Idempotency-Key above is what makes the eventual retry safe; the
       timeout is what stops us claiming failure while it is still working. */
    timeoutMs: 110_000,
    headers: { 'Idempotency-Key': `apnosh-boost-${(h >>> 0).toString(36)}` },
    body: JSON.stringify({
      postId: args.zernioPostId,
      accountId: args.accountId,
      adAccountId: args.adAccountId,
      name: args.name.slice(0, 255),
      /* Engagement, because a restaurant boosting a dish photo wants people to
         see and react to it. Traffic and conversions need a website and a pixel
         that most of these clients do not have. */
      goal: 'engagement',
      /* LIFETIME, never daily. This is the safety rail, not a preference. */
      budget: { amount, type: 'lifetime' },
      schedule: { startDate: start.toISOString(), endDate: end.toISOString() },
      ...(args.targeting && Object.keys(args.targeting).length ? { targeting: args.targeting } : {}),
      ...(args.linkUrl ? { linkUrl: args.linkUrl } : {}),
      ...(args.callToAction ? { callToAction: args.callToAction } : {}),
    }),
  })
  const d = (res.data && typeof res.data === 'object' ? res.data : res) as Record<string, unknown>
  return { id: str(d.id) || str(d._id) || str(d.adId) || null, status: str(d.status) || 'created' }
}

export interface RunningAd {
  id: string
  name: string
  status: string
  spend: number
  impressions: number
  clicks: number
  /** UNIQUE PEOPLE, which is the number an owner actually cares about and the
   *  one this was dropping. Impressions counts the same person twice; reach does
   *  not, and it is what makes "$70 reached 6,200 people" sayable. */
  reach: number
  /** Meta's own cost per 1,000 impressions for this ad. */
  cpm: number
}

/** What is running and what it has cost. Read-only. */
export async function listAds(clientId: string, accountId: string): Promise<RunningAd[]> {
  const profileId = await profileIdFor(clientId)
  if (!profileId) return []
  try {
    const res = await zer(`/ads?accountId=${encodeURIComponent(accountId)}&limit=25`)
    return unwrapList(res, 'ads', 'data', 'items').map((a) => {
      const m = (a.metrics && typeof a.metrics === 'object' ? a.metrics : {}) as Record<string, unknown>
      return {
        id: str(a.id) || str(a._id),
        name: str(a.name) || 'Boost',
        status: str(a.status) || 'unknown',
        spend: typeof m.spend === 'number' ? m.spend : 0,
        impressions: num(m.impressions),
        clicks: num(m.clicks),
        reach: num(m.reach),
        cpm: typeof m.cpm === 'number' ? m.cpm : 0,
      }
    }).filter((a) => a.id)
  } catch { return [] }
}

/** Stop one. The only write here that costs nothing and can only ever help. */
export async function stopAd(clientId: string, adId: string): Promise<void> {
  const profileId = await profileIdFor(clientId)
  if (!profileId) throw new ChannelError('not_connected', 'This client has no connected social account')
  await zer(`/ads/${encodeURIComponent(adId)}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status: 'PAUSED' }),
  })
}


export interface AdPreview { format: string; html: string | null }

/**
 * WHAT THE AD ACTUALLY LOOKS LIKE, rendered by Meta.
 *
 * Meta returns an <iframe> snippet per placement, which is the real thing rather
 * than our approximation of it: the same post reads differently in a Facebook
 * feed, an Instagram feed and a Reel, and an owner who has just spent money
 * should be able to see all three.
 *
 * Rendered from the AD, not from a creative spec we build. Building the spec
 * ourselves would mean guessing Meta's object_story_id format for an Instagram
 * post, and guessing a vendor's shape is exactly what has gone wrong on this
 * project before.
 */
export async function adPreviews(clientId: string, adId: string, formats?: string[]): Promise<AdPreview[]> {
  const profileId = await profileIdFor(clientId)
  if (!profileId) return []
  const want = (formats?.length ? formats : ['MOBILE_FEED_STANDARD', 'INSTAGRAM_STANDARD', 'INSTAGRAM_STORY'])
  const q = new URLSearchParams()
  for (const f of want) q.append('formats', f)
  try {
    const res = await zer(`/ads/${encodeURIComponent(adId)}/preview?${q.toString()}`)
    const d = (res.data && typeof res.data === 'object' ? res.data : res) as Record<string, unknown>
    return unwrapList({ data: d.previews }, 'data')
      .map((x) => ({ format: str(x.format), html: str(x.html) || null }))
      .filter((x) => x.format)
  } catch { return [] }
}

export interface Forecast {
  ok: boolean
  status: string
  /** people reached for the budget asked about */
  reach: number | null
  impressions: number | null
  /** Meta's own floor for this audience and window; the reason a small boost
   *  may get no answer at all. */
  minBudget: number | null
  maxBudget: number | null
  currency: string | null
  error: string | null
}

/**
 * WHAT THIS BUDGET REACHES, from Meta rather than from us.
 *
 * The owner's question was the right one: Ads Manager shows an estimated reach
 * for a budget, so why don't we. The answer is that reach-estimate has no budget
 * field -- but THIS endpoint does. Give it budgetAmount and Meta predicts the
 * reach; give it a reach and Meta predicts the budget.
 *
 * A QUOTE, in the vendor's own words: "nothing is bought and no ad entities are
 * created". Nothing here reserves anything; reserving is a separate call we do
 * not make.
 *
 * NOT WIRED TO THE SCREEN, and the measurements are why. Run against a real ad
 * account on 2026-09-10, Seattle within 25 miles:
 *
 *     $140 over 7 days  ->  failed:6, minBudget 783.44
 *     $70  over 7 days  ->  failed:6, minBudget 772.15
 *     $20  over 3 days  ->  failed:6, minBudget 968.61
 *
 * Meta's Reach and Frequency buying carries a minimum around $780 to $970 for
 * this audience and window. Our own cap is $500, so this can never answer for a
 * restaurant boost and a screen that called it would show an error every time.
 *
 * Kept because it is correct, measured, and the answer to "why can we not show
 * what the budget reaches" -- so nobody investigates this a second time. It
 * becomes useful the day a client spends four figures, or if Zernio exposes
 * Meta's AUCTION-side delivery estimate, which is the endpoint Ads Manager
 * actually uses and which is absent from their schema entirely.
 */
export async function forecastReach(clientId: string, args: {
  accountId: string
  adAccountId: string
  budget: number
  days: number
  targeting: Record<string, unknown>
  /** how many times one person may see it over the window; 2 by default */
  frequencyCap?: number
}): Promise<Forecast> {
  const profileId = await profileIdFor(clientId)
  const none: Forecast = { ok: false, status: 'unavailable', reach: null, impressions: null, minBudget: null, maxBudget: null, currency: null, error: null }
  if (!profileId) return none
  const start = new Date(Date.now() + 60 * 60 * 1000)
  const end = new Date(start.getTime() + Math.max(1, args.days) * 86400000)
  try {
    const res = await zer('/ads/rf-predictions', {
      method: 'POST',
      timeoutMs: 25_000,
      body: JSON.stringify({
        accountId: args.accountId,
        adAccountId: args.adAccountId,
        budgetAmount: Math.round(args.budget * 100) / 100,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        /* REQUIRED, and only discovered by calling it: Meta rejects the whole
           prediction with "you must provide a value for the frequency cap
           parameter" unless is_balanced_frequency is set. Two over the window is
           the right number for a restaurant -- enough to be remembered, few
           enough that the same person is not followed around for a week. It also
           makes the reach figure conservative, which is the safe direction for a
           number somebody is about to spend against. */
        frequencyCap: Math.max(1, Math.min(90, args.frequencyCap ?? 2)),
        targeting: args.targeting,
      }),
    })
    const d = (res.data && typeof res.data === 'object' ? res.data : res) as Record<string, unknown>
    const p = (d.prediction && typeof d.prediction === 'object' ? d.prediction : {}) as Record<string, unknown>
    const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
    return {
      ok: str(p.status) === 'ready',
      status: str(p.status) || 'unknown',
      reach: n(p.reach),
      impressions: n(p.impressions),
      minBudget: n(p.minBudget),
      maxBudget: n(p.maxBudget),
      currency: str(d.currency) || null,
      error: null,
    }
  } catch (e) {
    return { ...none, error: e instanceof Error ? e.message : 'forecast failed' }
  }
}

export interface Demographics { topAge: string | null; women: number | null; men: number | null }

/**
 * WHO THEIR FOLLOWERS ACTUALLY ARE.
 *
 * The one thing we can say that an ad platform cannot: Meta knows what its own
 * ads did, not who already follows this restaurant. It turns "pick an age range"
 * from a guess into "your followers are mostly 35 to 44, want to aim there?"
 *
 * Needs 100+ followers and lags up to 48 hours, per the vendor. Null rather than
 * zeros when it cannot say, so the panel can stay quiet instead of asserting.
 */
export async function instagramDemographics(clientId: string, accountId: string): Promise<Demographics | null> {
  const profileId = await profileIdFor(clientId)
  if (!profileId) return null
  try {
    const res = await zer(`/analytics/instagram/demographics?accountId=${encodeURIComponent(accountId)}&breakdown=age,gender`)
    const d = (res.data && typeof res.data === 'object' ? res.data : res) as Record<string, unknown>
    const demo = (d.demographics && typeof d.demographics === 'object' ? d.demographics : {}) as Record<string, unknown>
    const rows = (k: string) => unwrapList({ data: demo[k] }, 'data')
      .map((x) => ({ dim: str(x.dimension), n: num(x.value) }))
      .filter((x) => x.dim && x.n > 0)

    const ages = rows('age').sort((a, b) => b.n - a.n)
    const genders = rows('gender')
    const total = genders.reduce((n, g) => n + g.n, 0)
    const pct = (code: string) => {
      const hit = genders.find((g) => g.dim.toUpperCase().startsWith(code))
      return total > 0 && hit ? Math.round((hit.n / total) * 100) : null
    }
    return { topAge: ages[0]?.dim ?? null, women: pct('F'), men: pct('M') }
  } catch { return null }
}
