'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SocialMetricsRow, SocialPlatform, Review, ReviewSource } from '@/types/database'

type ActionResult<T = undefined> = { success: true; data?: T } | { success: false; error: string }

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: 'Not authenticated' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') return { ok: false as const, error: 'Admin access required' }
  return { ok: true as const, userId: user.id }
}

// ---------------------------------------------------------------------------
// Social metrics
// ---------------------------------------------------------------------------

export async function upsertSocialMetrics(
  input: {
    client_id: string
    platform: SocialPlatform
    month: number
    year: number
    posts_published?: number
    posts_planned?: number
    total_reach?: number
    total_impressions?: number
    total_engagement?: number
    likes?: number
    comments?: number
    shares?: number
    saves?: number
    followers_count?: number
    followers_change?: number
    top_post_url?: string | null
    top_post_caption?: string | null
    top_post_engagement?: number | null
    top_post_image_url?: string | null
    notes?: string | null
  },
): Promise<ActionResult<{ id: string }>> {
  const check = await requireAdmin()
  if (!check.ok) return { success: false, error: check.error }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('social_metrics')
    .upsert(
      {
        client_id: input.client_id,
        platform: input.platform,
        month: input.month,
        year: input.year,
        posts_published: input.posts_published ?? 0,
        posts_planned: input.posts_planned ?? 0,
        total_reach: input.total_reach ?? 0,
        total_impressions: input.total_impressions ?? 0,
        total_engagement: input.total_engagement ?? 0,
        likes: input.likes ?? 0,
        comments: input.comments ?? 0,
        shares: input.shares ?? 0,
        saves: input.saves ?? 0,
        followers_count: input.followers_count ?? 0,
        followers_change: input.followers_change ?? 0,
        top_post_url: input.top_post_url ?? null,
        top_post_caption: input.top_post_caption ?? null,
        top_post_engagement: input.top_post_engagement ?? null,
        top_post_image_url: input.top_post_image_url ?? null,
        notes: input.notes ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'client_id,platform,month,year' },
    )
    .select('id')
    .single()

  if (error || !data) return { success: false, error: error?.message || 'Upsert failed' }

  revalidatePath('/admin/clients')
  revalidatePath('/dashboard/social/performance')
  return { success: true, data: { id: data.id } }
}

export async function deleteSocialMetrics(id: string): Promise<ActionResult> {
  const check = await requireAdmin()
  if (!check.ok) return { success: false, error: check.error }

  const admin = createAdminClient()
  const { error } = await admin.from('social_metrics').delete().eq('id', id)
  if (error) return { success: false, error: error.message }

  revalidatePath('/admin/clients')
  revalidatePath('/dashboard/social/performance')
  return { success: true }
}

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

export async function createReview(
  input: {
    client_id: string
    source: ReviewSource
    rating: number
    author_name?: string | null
    author_avatar_url?: string | null
    review_text?: string | null
    review_url?: string | null
    response_text?: string | null
    responded_at?: string | null
    responded_by?: string | null
    flagged?: boolean
    flag_reason?: string | null
    posted_at: string
    external_id?: string | null
  },
): Promise<ActionResult<{ id: string }>> {
  const check = await requireAdmin()
  if (!check.ok) return { success: false, error: check.error }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('reviews')
    .insert({
      client_id: input.client_id,
      source: input.source,
      rating: input.rating,
      author_name: input.author_name ?? null,
      author_avatar_url: input.author_avatar_url ?? null,
      review_text: input.review_text ?? null,
      review_url: input.review_url ?? null,
      response_text: input.response_text ?? null,
      responded_at: input.responded_at ?? null,
      responded_by: input.responded_by ?? null,
      flagged: input.flagged ?? false,
      flag_reason: input.flag_reason ?? null,
      posted_at: input.posted_at,
      external_id: input.external_id ?? null,
    })
    .select('id')
    .single()

  if (error || !data) return { success: false, error: error?.message || 'Create failed' }

  revalidatePath('/admin/clients')
  revalidatePath('/dashboard/local-seo/reviews')
  return { success: true, data: { id: data.id } }
}

export async function updateReview(
  id: string,
  updates: Partial<Omit<Review, 'id' | 'client_id' | 'created_at' | 'updated_at'>>,
): Promise<ActionResult> {
  const check = await requireAdmin()
  if (!check.ok) return { success: false, error: check.error }

  const admin = createAdminClient()
  const { error } = await admin.from('reviews').update(updates).eq('id', id)
  if (error) return { success: false, error: error.message }

  revalidatePath('/admin/clients')
  revalidatePath('/dashboard/local-seo/reviews')
  return { success: true }
}

export async function deleteReview(id: string): Promise<ActionResult> {
  const check = await requireAdmin()
  if (!check.ok) return { success: false, error: check.error }

  const admin = createAdminClient()
  const { error } = await admin.from('reviews').delete().eq('id', id)
  if (error) return { success: false, error: error.message }

  revalidatePath('/admin/clients')
  revalidatePath('/dashboard/local-seo/reviews')
  return { success: true }
}

// ---------------------------------------------------------------------------
// Review snapshots (aggregate per platform -- rating + count)
// ---------------------------------------------------------------------------

export async function upsertReviewSnapshot(
  input: {
    client_id: string
    platform: string
    date: string
    rating_avg: number
    review_count: number
    new_reviews?: number
    response_rate?: number
  },
): Promise<ActionResult<{ id: string }>> {
  const check = await requireAdmin()
  if (!check.ok) return { success: false, error: check.error }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('review_metrics')
    .upsert(
      {
        client_id: input.client_id,
        platform: input.platform,
        date: input.date,
        rating_avg: input.rating_avg,
        review_count: input.review_count,
        new_reviews: input.new_reviews ?? 0,
        response_rate: input.response_rate ?? null,
      },
      { onConflict: 'client_id,platform,date' },
    )
    .select('id')
    .single()

  if (error || !data) return { success: false, error: error?.message || 'Upsert failed' }

  revalidatePath('/admin/clients')
  return { success: true, data: { id: data.id } }
}

// ---------------------------------------------------------------------------
// Website metrics (manual entry for clients without GA4)
// ---------------------------------------------------------------------------

export async function upsertWebsiteMetrics(
  input: {
    client_id: string
    date: string
    visitors?: number
    page_views?: number
    sessions?: number
    bounce_rate?: number
    avg_session_duration?: number
    mobile_pct?: number
    traffic_sources?: string
    top_pages?: string
  },
): Promise<ActionResult<{ id: string }>> {
  const check = await requireAdmin()
  if (!check.ok) return { success: false, error: check.error }

  const admin = createAdminClient()

  let trafficJson = null
  let pagesJson = null
  try { if (input.traffic_sources) trafficJson = JSON.parse(input.traffic_sources) }
  catch { trafficJson = { raw: input.traffic_sources } }
  try { if (input.top_pages) pagesJson = JSON.parse(input.top_pages) }
  catch { pagesJson = { raw: input.top_pages } }

  const { data, error } = await admin
    .from('website_metrics')
    .upsert(
      {
        client_id: input.client_id,
        date: input.date,
        visitors: input.visitors ?? 0,
        page_views: input.page_views ?? 0,
        sessions: input.sessions ?? 0,
        bounce_rate: input.bounce_rate ?? null,
        avg_session_duration: input.avg_session_duration ?? null,
        mobile_pct: input.mobile_pct ?? null,
        traffic_sources: trafficJson,
        top_pages: pagesJson,
      },
      { onConflict: 'client_id,date' },
    )
    .select('id')
    .single()

  if (error || !data) return { success: false, error: error?.message || 'Upsert failed' }

  revalidatePath('/admin/clients')
  revalidatePath('/dashboard/website')
  return { success: true, data: { id: data.id } }
}
