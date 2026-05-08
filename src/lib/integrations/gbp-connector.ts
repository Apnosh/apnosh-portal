/**
 * Google Business Profile Connector (Q1 wk 5-6, 1.2).
 *
 * Implements review fetch (sync) and review-response post (via the
 * postReply helper called from the response composer in wk 6).
 *
 * Reviews live under the v4 API, not the v1 mybusinessbusinessinformation
 * API. v4 is the only path Google supports for review-level operations.
 *
 * Tokens come from channel_connections rows where channel='google_business_profile'.
 * The Q1 plan calls for re-consent into the broader business.manage scope
 * before this cron runs at scale (audits/2026-05-gmb-reconsent-email.md).
 */

import type { Connector, ConnectionRow, SyncResult, RefreshResult, TestResult } from './types'
import { createAdminClient } from '@/lib/supabase/admin'
import { logEvent } from '@/lib/events/log'

const V4_BASE = 'https://mybusiness.googleapis.com/v4'

interface GbpReview {
  reviewId: string
  reviewer?: { displayName?: string; profilePhotoUrl?: string; isAnonymous?: boolean }
  starRating?: 'ONE' | 'TWO' | 'THREE' | 'FOUR' | 'FIVE'
  comment?: string
  createTime: string
  updateTime?: string
  reviewReply?: { comment: string; updateTime: string }
  name: string  // accounts/{a}/locations/{l}/reviews/{r}
}

const STAR_MAP: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 }

async function fetchReviewsForLocation(
  accessToken: string,
  accountId: string,
  locationId: string
): Promise<GbpReview[]> {
  const url = `${V4_BASE}/accounts/${accountId}/locations/${locationId}/reviews?pageSize=50`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error?.message || `GMB reviews fetch failed: HTTP ${res.status}`)
  }
  const data = (await res.json()) as { reviews?: GbpReview[] }
  return data.reviews ?? []
}

/**
 * Sync reviews for a single client connection. Walks every gbp_location
 * mapped to this client and pulls recent reviews.
 *
 * Idempotent via (client_id, source, external_id) upsert.
 */
async function syncGbpReviews(connection: ConnectionRow): Promise<SyncResult> {
  if (!connection.access_token) return { ok: false, error: 'No access token' }

  const admin = createAdminClient()

  // metadata.account_id is set during the OAuth callback; fall back to the
  // wildcard '-' if absent (v4 supports it for review reads).
  const accountId =
    (connection.metadata?.account_id as string | undefined) ?? '-'

  const { data: locations, error: locErr } = await admin
    .from('gbp_locations')
    .select('store_code')
    .eq('client_id', connection.client_id)

  if (locErr) return { ok: false, error: locErr.message }
  if (!locations || locations.length === 0) {
    return { ok: true, count: 0 }  // nothing to fetch
  }

  let total = 0
  for (const loc of locations) {
    const storeCode = loc.store_code as string
    let reviews: GbpReview[]
    try {
      reviews = await fetchReviewsForLocation(connection.access_token, accountId, storeCode)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'fetch failed'
      // One bad location shouldn't kill the whole sync. Log + continue.
      console.error(`GBP review fetch failed for ${storeCode}:`, message)
      continue
    }

    for (const r of reviews) {
      const rating = r.starRating ? STAR_MAP[r.starRating] : null
      if (rating === null) continue  // malformed -- skip

      const isNewReview = await upsertReview(admin, connection.client_id, r, rating)

      if (isNewReview) {
        await logEvent({
          clientId: connection.client_id,
          eventType: 'review.received',
          subjectType: 'review',
          subjectId: undefined,  // we don't have the row id back from upsert
          actorRole: 'cron',
          payload: {
            reviewId: r.reviewId,
            source: 'google',
            rating,
            excerpt: (r.comment ?? '').slice(0, 200),
          },
          summary: `New ${rating}★ review from ${r.reviewer?.displayName ?? 'a customer'}`,
          occurredAt: new Date(r.createTime),
        })
      }
      total++
    }
  }

  return { ok: true, count: total }
}

async function upsertReview(
  admin: ReturnType<typeof createAdminClient>,
  clientId: string,
  r: GbpReview,
  rating: number
): Promise<boolean> {
  // Check existing first so we can distinguish "new" from "updated" for events.
  const { data: existing } = await admin
    .from('reviews')
    .select('id')
    .eq('client_id', clientId)
    .eq('source', 'google')
    .eq('external_id', r.reviewId)
    .maybeSingle()

  const payload = {
    client_id: clientId,
    source: 'google' as const,
    external_id: r.reviewId,
    rating,
    author_name: r.reviewer?.displayName ?? 'Anonymous',
    author_avatar_url: r.reviewer?.profilePhotoUrl ?? null,
    review_text: r.comment ?? null,
    review_url: null,
    response_text: r.reviewReply?.comment ?? null,
    responded_at: r.reviewReply?.updateTime ?? null,
    posted_at: r.createTime,
    flagged: rating <= 3,
  }

  if (existing) {
    await admin.from('reviews').update(payload).eq('id', existing.id)
    return false
  } else {
    await admin.from('reviews').insert(payload)
    return true
  }
}

export const gbpConnector: Connector = {
  channel: 'google_business_profile',
  label: 'Google Business Profile',

  async sync(connection: ConnectionRow): Promise<SyncResult> {
    return syncGbpReviews(connection)
  },

  async refresh(_connection: ConnectionRow): Promise<RefreshResult> {
    // Google access tokens come with a refresh_token; the existing
    // /api/auth/google/* callbacks handle rotation. The cron treats
    // GBP rows as no-ops here -- legacy refresh logic in google.ts
    // remains the source of truth until wk 9 sweep.
    return { ok: true }
  },

  async testConnection(connection: ConnectionRow): Promise<TestResult> {
    if (!connection.access_token) return { ok: false, error: 'No token' }
    try {
      const res = await fetch(
        'https://mybusinessaccountmanagement.googleapis.com/v1/accounts?pageSize=1',
        { headers: { Authorization: `Bearer ${connection.access_token}` } }
      )
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        return { ok: false, error: body.error?.message || `HTTP ${res.status}` }
      }
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Network error' }
    }
  },
}

/**
 * Post a reply to a Google review. Called from the response composer
 * (wk 6). Requires the business.manage scope.
 *
 * The review's `name` is its full path: accounts/{a}/locations/{l}/reviews/{r}.
 * We don't store this directly; reconstruct from external_id + location.
 */
export async function postReplyToReview(args: {
  accessToken: string
  accountId: string
  locationId: string
  reviewId: string
  comment: string
}): Promise<{ ok: boolean; error?: string }> {
  const { accessToken, accountId, locationId, reviewId, comment } = args
  const url = `${V4_BASE}/accounts/${accountId}/locations/${locationId}/reviews/${reviewId}/reply`
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ comment }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    return { ok: false, error: body.error?.message || `HTTP ${res.status}` }
  }
  return { ok: true }
}
