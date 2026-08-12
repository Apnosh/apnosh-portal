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
}

export type VendorPublishOutcome =
  | { available: false }
  | { available: true; results: Record<string, VendorPlatformResult> }

/** The client's vendor profile id, or null when they publish through their own tokens. */
export async function getVendorProfileId(clientId: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('channel_connections')
    .select('metadata, status')
    .eq('client_id', clientId)
    .eq('channel', 'zernio')
    .eq('status', 'active')
    .order('connected_at', { ascending: false })
    .limit(1)
    .maybeSingle()
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

  const body: Record<string, unknown> = {
    content: input.text,
    platforms: targets.map((t) => ({ platform: t.p, accountId: t.accountId })),
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
    for (const t of targets) results[t.p] = { status: 'failed', error: msg }
    return { available: true, results }
  }

  const payload = (await res.json().catch(() => null)) as Record<string, unknown> | null
  if (!res.ok) {
    const msg = String(
      (payload?.message ?? payload?.error ?? `Social service returned ${res.status}`) as string,
    ).slice(0, 300)
    for (const t of targets) results[t.p] = { status: 'failed', error: msg }
    return { available: true, results }
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

  for (const t of targets) {
    const row = byPlatform.get(t.p)
    const status = String((row?.status ?? post.status ?? '') as string).toLowerCase()
    const failed = status === 'failed' || !!row?.error
    results[t.p] = failed
      ? { status: 'failed', error: String((row?.error ?? 'The social service could not post this.') as string).slice(0, 300) }
      : {
          status: 'published',
          post_id: String((row?.platformPostId ?? row?._id ?? postId) as string) || undefined,
          post_url: typeof row?.platformPostUrl === 'string' ? row.platformPostUrl : undefined,
        }
  }

  return { available: true, results }
}
