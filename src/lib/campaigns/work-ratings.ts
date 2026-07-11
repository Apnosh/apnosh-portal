/**
 * Delivered-work ratings — server side (admin client). The pure rules live in
 * work-ratings-core.ts; this file is the DB seam: read existing ratings, insert
 * one (race-safe on the unique index), and compute a creator's live aggregate.
 *
 * Aggregates read work_ratings ONLY — real rows written by paying clients on
 * real delivered orders. No seeds, no samples; zero rows = null = "No ratings
 * yet" upstream.
 */
import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { computeAggregate, type RatingAggregate } from './work-ratings-core'

export interface WorkRating {
  id: string
  workOrderId: string | null
  creatorId: string
  clientId: string
  campaignId: string | null
  stars: number
  comment: string | null
  createdAt: string
}

function rowToRating(r: Record<string, unknown>): WorkRating {
  return {
    id: r.id as string,
    workOrderId: (r.work_order_id as string) ?? null,
    creatorId: (r.creator_id as string) ?? '',
    clientId: (r.client_id as string) ?? '',
    campaignId: (r.campaign_id as string) ?? null,
    stars: (r.stars as number) ?? 0,
    comment: (r.comment as string) ?? null,
    createdAt: (r.created_at as string) ?? '',
  }
}

/** Existing ratings for a batch of orders, keyed by work_order_id. Degrades to
 *  an empty map if the table is not deployed yet (migration 205 pending). */
export async function getRatingsForOrders(orderIds: string[]): Promise<Map<string, WorkRating>> {
  const map = new Map<string, WorkRating>()
  const ids = orderIds.filter(Boolean)
  if (!ids.length) return map
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.from('work_ratings').select('*').in('work_order_id', ids)
    if (error || !data) return map
    for (const r of data) { const w = rowToRating(r); if (w.workOrderId) map.set(w.workOrderId, w) }
  } catch { /* table missing pre-migration — no ratings */ }
  return map
}

/** Insert one rating. The route validates first (validateRating); the unique
 *  index is the race backstop — a concurrent duplicate comes back as 'duplicate'. */
export async function insertWorkRating(input: {
  workOrderId: string
  creatorId: string
  clientId: string
  campaignId: string | null
  stars: number
  comment: string | null
}): Promise<{ ok: true } | { ok: false; error: 'duplicate' | string }> {
  const admin = createAdminClient()
  const { error } = await admin.from('work_ratings').insert({
    work_order_id: input.workOrderId,
    creator_id: input.creatorId,
    client_id: input.clientId,
    campaign_id: input.campaignId,
    stars: input.stars,
    comment: input.comment,
  })
  if (error) return { ok: false, error: error.code === '23505' ? 'duplicate' : error.message }
  return { ok: true }
}

/** A creator's live aggregate from real rating rows. Null = no ratings yet. */
export async function creatorRatingAggregate(creatorId: string): Promise<RatingAggregate | null> {
  if (!creatorId) return null
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.from('work_ratings').select('stars').eq('creator_id', creatorId)
    if (error || !data) return null
    return computeAggregate(data.map((r) => (r.stars as number) ?? 0))
  } catch { return null }
}

/** Aggregates for a batch of creators in one query, keyed by creator_id.
 *  Creators with zero ratings simply have no entry — never a fabricated 0. */
export async function creatorRatingAggregates(creatorIds: string[]): Promise<Map<string, RatingAggregate>> {
  const map = new Map<string, RatingAggregate>()
  const ids = [...new Set(creatorIds.filter(Boolean))]
  if (!ids.length) return map
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.from('work_ratings').select('creator_id, stars').in('creator_id', ids)
    if (error || !data) return map
    const byCreator = new Map<string, number[]>()
    for (const r of data) {
      const cid = (r.creator_id as string) ?? ''
      if (!cid) continue
      const list = byCreator.get(cid) ?? []
      list.push((r.stars as number) ?? 0)
      byCreator.set(cid, list)
    }
    for (const [cid, stars] of byCreator) {
      const agg = computeAggregate(stars)
      if (agg) map.set(cid, agg)
    }
  } catch { /* pre-migration */ }
  return map
}

export interface RecentRating extends WorkRating {
  campaignName: string | null
  orderTitle: string | null
}

/** A creator's most recent ratings with comments and context (admin surface). */
export async function recentRatingsForCreator(creatorId: string, limit = 10): Promise<RecentRating[]> {
  if (!creatorId) return []
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('work_ratings')
      .select('*, campaigns(name), creator_work_orders(title)')
      .eq('creator_id', creatorId)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error || !data) return []
    return data.map((r) => ({
      ...rowToRating(r),
      campaignName: ((r as { campaigns?: { name?: string } | null }).campaigns?.name) ?? null,
      orderTitle: ((r as { creator_work_orders?: { title?: string } | null }).creator_work_orders?.title) ?? null,
    }))
  } catch { return [] }
}
