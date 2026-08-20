import 'server-only'

/**
 * Publishing THROUGH the social vendor (Zernio).
 *
 * WHY THIS EXISTS. The direct-API publishers in this folder (instagram.ts, facebook.ts,
 * linkedin.ts) read tokens from `social_connections`, which is the lane we RETIRED for
 * analytics in August 2026: clients now link their accounts on Zernio's hosted page, so they
 * have a vendor row in `channel_connections` and NO per-platform tokens of ours. Every publish
 * for those clients died on 'no_connections' — the content was made, approved, scheduled, and
 * then hit a wall nobody could see from the outside.
 *
 * So: when a client's accounts live on the vendor, the vendor publishes. Same draft, same
 * approval, same schedule; a different pipe.
 *
 * HONESTY. Zernio's own per-post status is the receipt. We report 'published' only for the
 * platforms it accepted, and each failure carries the vendor's message rather than a generic
 * one — the publish rail's caller decides retry vs. hard fail from those, and a lie here would
 * mean a draft marked live that never posted.
 *
 * Zernio API laws used here (learned live, see adapters/zernio.ts):
 *   - ids are 24-char Mongo-style strings in `_id`
 *   - POST /v1/posts takes { content, platforms: [{platform, accountId}], mediaItems, publishNow }
 *   - media URLs must be publicly reachable, correct Content-Type
 *   - GET /v1/accounts lists a profile's accounts (data.accounts[]), each with `_id` + platform
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { normalizePlatform } from '@/lib/channels/adapters/zernio'

const API = 'https://api.zernio.com/v1'

export interface VendorPublishInput {
  clientId: string
  text: string
  mediaUrls: string[]
  mediaType: 'image' | 'video' | 'carousel'
  /** our canonical platform keys: instagram | facebook | tiktok | linkedin | youtube */
  platforms: string[]
  /** ISO string to schedule, or null to publish now */
  scheduledFor?: string | null
}

export interface VendorPlatformResult {
  status: 'published' | 'failed'
  post_id?: string
  post_url?: string
  error?: string
  /** The vendor's post RECORD id — the row the verify sweep re-reads later.
   *  A platform can fail asynchronously after the creation call said
   *  'published' (TikTok did exactly this, live, 2026-08-20). */
  record_id?: string
}

export type VendorPublishOutcome =
  | { available: false }
  | { available: true; results: Record<string, VendorPlatformResult> }

/** The client's vendor profile id, or null when they publish through their own tokens. */
export async function getVendorProfileId(clientId: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('channel_connections')
    .select('platform_account_id, metadata, status')
    .eq('client_id', clientId)
    .eq('channel', 'zernio')
    .eq('status', 'active')
    .order('connected_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  /* The connect flow stores the vendor profile id in platform_account_id (a
   * hosted_link vendor holds no token, that column IS its identity) — reading
   * only metadata.profile_id here left every Zernio client publishing as if
   * unconnected (hard-failed 'missing_platform_connection', caught live
   * 2026-08-19 on the first real send-off). Keep the metadata fallback for
   * any older rows that stored it there. */
  if (typeof data?.platform_account_id === 'string' && data.platform_account_id.length > 0) {
    return data.platform_account_id
  }
  const meta = (data?.metadata ?? {}) as Record<string, unknown>
  const id = meta.profile_id ?? meta.profileId
  return typeof id === 'string' && id.length > 0 ? id : null
}

function apiKey(): string | null {
  const k = process.env.ZERNIO_API_KEY
  return k && k.length > 0 ? k : null
}

/** accountId per platform for a profile. Absent platforms simply aren't linked. */
async function accountsFor(profileId: string, key: string): Promise<Record<string, string>> {
  const res = await fetch(`${API}/accounts?profileId=${encodeURIComponent(profileId)}`, {
    headers: { Authorization: `Bearer ${key}` },
    cache: 'no-store',
  })
  if (!res.ok) return {}
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null
  const raw = body?.data ?? body
  const list = ((raw as Record<string, unknown> | null)?.accounts ?? []) as Record<string, unknown>[]
  const out: Record<string, string> = {}
  for (const a of Array.isArray(list) ? list : []) {
    const platform = normalizePlatform(a.platform ?? a.provider ?? a.type)
    const id = a._id ?? a.id
    if (platform && typeof id === 'string' && !out[platform]) out[platform] = id
  }
  return out
}

/**
 * Publish a draft through the vendor.
 *
 * Returns { available: false } when this client does not publish through the vendor (no profile
 * or no key configured) so the caller can fall back to the direct-token publishers unchanged.
 */
export async function publishViaVendor(input: VendorPublishInput): Promise<VendorPublishOutcome> {
  const key = apiKey()
  if (!key) return { available: false }
  const profileId = await getVendorProfileId(input.clientId)
  if (!profileId) return { available: false }

  const accounts = await accountsFor(profileId, key)
  const results: Record<string, VendorPlatformResult> = {}

  // Platforms the vendor doesn't hold are honest per-platform failures, not a silent drop.
  const targets = input.platforms
    .map((p) => ({ p, accountId: accounts[p] }))
    .filter((t) => {
      if (t.accountId) return true
      results[t.p] = { status: 'failed', error: `${t.p} is not linked on your social connection.` }
      return false
    })

  if (targets.length === 0) return { available: true, results }

  const mediaItems = input.mediaUrls.map((url) => ({
    type: input.mediaType === 'video' || /\.(mp4|mov|m4v|webm)(\?|$)/i.test(url) ? 'video' : 'image',
    url,
  }))

  type Target = { p: string; accountId: string }
  const postBatch = async (batch: Target[], text: string): Promise<void> => {
    if (batch.length === 0) return
    const body: Record<string, unknown> = {
      content: text,
      platforms: batch.map((t) => ({ platform: t.p, accountId: t.accountId })),
      ...(mediaItems.length > 0 ? { mediaItems } : {}),
      ...(input.scheduledFor ? { scheduledFor: input.scheduledFor } : { publishNow: true }),
    }

    let res: Response
    try {
      res = await fetch(`${API}/posts`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        cache: 'no-store',
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not reach the social service.'
      for (const t of batch) results[t.p] = { status: 'failed', error: msg }
      return
    }

    const payload = (await res.json().catch(() => null)) as Record<string, unknown> | null
    if (!res.ok) {
      const msg = String(
        (payload?.message ?? payload?.error ?? `Social service returned ${res.status}`) as string,
      ).slice(0, 300)
      for (const t of batch) results[t.p] = { status: 'failed', error: msg }
      return
    }

    // The created post carries per-platform detail; a platform entry that reports its own
    // failure is reported as failed even when the request itself was accepted.
    const post = ((payload?.data ?? payload) ?? {}) as Record<string, unknown>
    const postId = String((post._id ?? post.id ?? '') as string)
    const perPlatform = (post.platforms ?? []) as Record<string, unknown>[]
    const byPlatform = new Map<string, Record<string, unknown>>()
    for (const row of Array.isArray(perPlatform) ? perPlatform : []) {
      const p = normalizePlatform(row.platform)
      if (p) byPlatform.set(p, row)
    }

    for (const t of batch) {
      const row = byPlatform.get(t.p)
      const status = String((row?.status ?? post.status ?? '') as string).toLowerCase()
      const failed = status === 'failed' || !!row?.error
      results[t.p] = failed
        ? { status: 'failed', error: String((row?.error ?? 'The social service could not post this.') as string).slice(0, 300), record_id: postId || undefined }
        : {
            status: 'published',
            post_id: String((row?.platformPostId ?? row?._id ?? postId) as string) || undefined,
            post_url: typeof row?.platformPostUrl === 'string' ? row.platformPostUrl : undefined,
            record_id: postId || undefined,
          }
    }
  }

  /* TikTok photo posts use the post content as the slideshow TITLE, which TikTok caps at 90
   * characters — and Zernio validates the whole request upfront, so ONE long caption used to
   * fail ALL platforms in the batch (caught live 2026-08-20: a 167-char caption killed
   * facebook/instagram/linkedin too). Split: everyone else keeps the owner's approved caption
   * verbatim; TikTok alone gets a word-boundary shortening only when it must. */
  const TIKTOK_TITLE_CAP = 90
  const isPhotoPost = mediaItems.length > 0 && mediaItems.every((m) => m.type === 'image')
  const needsShortTitle = isPhotoPost && input.text.length > TIKTOK_TITLE_CAP
  const tiktokTargets = needsShortTitle ? targets.filter((t) => t.p === 'tiktok') : []
  const mainTargets = needsShortTitle ? targets.filter((t) => t.p !== 'tiktok') : targets

  await postBatch(mainTargets, input.text)
  if (tiktokTargets.length > 0) {
    const cut = input.text.slice(0, TIKTOK_TITLE_CAP - 1)
    const lastSpace = cut.lastIndexOf(' ')
    const short = `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trim()}…`
    await postBatch(tiktokTargets, short)
  }

  return { available: true, results }
}

export interface VendorPostRecord {
  id: string
  createdAt: string | null
  status: string | null
  platforms: { platform: string | null; status: string | null; error: string | null; url: string | null }[]
}

/** The vendor's recent API-created post records — the ground truth the verify
 *  sweep compares against the optimistic creation receipts. Read-only. */
export async function listVendorPosts(profileId: string): Promise<VendorPostRecord[] | null> {
  const key = apiKey()
  if (!key) return null
  let res: Response
  try {
    res = await fetch(`${API}/posts?profileId=${encodeURIComponent(profileId)}&limit=10`, {
      headers: { Authorization: `Bearer ${key}` },
      cache: 'no-store',
    })
  } catch {
    return null
  }
  if (!res.ok) return null
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null
  const raw = (body?.data ?? body) as Record<string, unknown> | unknown[] | null
  const list = Array.isArray(raw) ? raw : ((raw as Record<string, unknown> | null)?.posts ?? [])
  if (!Array.isArray(list)) return null
  return (list as Record<string, unknown>[]).map((post) => ({
    id: String(post._id ?? post.id ?? ''),
    createdAt: typeof post.createdAt === 'string' ? post.createdAt : null,
    status: typeof post.status === 'string' ? post.status : null,
    platforms: (Array.isArray(post.platforms) ? (post.platforms as Record<string, unknown>[]) : []).map((r) => ({
      platform: normalizePlatform(r.platform),
      status: typeof r.status === 'string' ? r.status : null,
      error: typeof r.error === 'string' ? r.error : null,
      url: typeof r.platformPostUrl === 'string' ? r.platformPostUrl : null,
    })),
  }))
}

export interface VendorAccount { id: string; platform: string; name: string }

/** The vendor's linked accounts for a profile, WITH their real usernames —
 *  the read that makes a wrong-account link (dosikbbq on the Apnosh profile,
 *  2026-08-17) visible at a glance instead of after a public post. */
export async function listVendorAccounts(profileId: string): Promise<VendorAccount[] | null> {
  const key = apiKey()
  if (!key) return null
  let res: Response
  try {
    res = await fetch(`${API}/accounts?profileId=${encodeURIComponent(profileId)}`, {
      headers: { Authorization: `Bearer ${key}` },
      cache: 'no-store',
    })
  } catch {
    return null
  }
  if (!res.ok) return null
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null
  const raw = (body?.data ?? body) as Record<string, unknown> | unknown[] | null
  const list = Array.isArray(raw) ? raw : ((raw as Record<string, unknown> | null)?.accounts ?? [])
  if (!Array.isArray(list)) return null
  return (list as Record<string, unknown>[]).map((a) => ({
    id: String(a._id ?? a.id ?? ''),
    platform: normalizePlatform(a.platform ?? a.provider ?? a.type) || String(a.platform ?? ''),
    name: String(a.name ?? a.username ?? a.handle ?? ''),
  }))
}
