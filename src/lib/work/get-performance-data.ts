/**
 * Data analyst's view of the system: this week's throughput plus
 * recent top performers across the entire book. RLS already filters
 * each query to clients the analyst can see, so totals are
 * automatically scoped.
 *
 * The point of this surface isn't pretty charts — it's making the
 * compounding loop visible. Drafts created, judged, published,
 * replied to, reviewed. If the numbers grow week-over-week and the
 * winners list keeps refreshing, the system is working.
 */

import { createClient as createServerClient } from '@/lib/supabase/server'

export interface CountPair { thisWeek: number; lastWeek: number }

export interface SystemCounts {
  draftsCreated: CountPair
  draftsApproved: CountPair
  draftsPublished: CountPair
  judgments: CountPair
  replies: CountPair
  reviewReplies: CountPair
  aiGenerations: CountPair
  boostsLaunched: CountPair
}

export interface TopPostRow {
  postId: string
  clientId: string
  clientName: string | null
  platform: string
  caption: string
  permalink: string | null
  mediaUrl: string | null
  reach: number
  totalInteractions: number
  engagementRate: number | null
  postedAt: string | null
}

export interface ClientActivityRow {
  clientId: string
  clientName: string | null
  draftCount: number
  publishedCount: number
  totalEngagement: number
  reviewsAnswered: number
  repliesSent: number
}

export interface PerformanceData {
  counts: SystemCounts
  topPosts: TopPostRow[]
  clientActivity: ClientActivityRow[]
  bookSize: number
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

async function countInRange(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  table: string,
  tsCol: string,
  filters: Array<[string, string, string]>,
  from: Date,
  to: Date,
): Promise<number> {
  let q = supabase.from(table).select('id', { count: 'exact', head: true })
    .gte(tsCol, from.toISOString())
    .lt(tsCol, to.toISOString())
  for (const [col, op, val] of filters) {
    if (op === 'eq') q = q.eq(col, val)
    else if (op === 'in') q = q.in(col, val.split(','))
  }
  const { count } = await q
  return count ?? 0
}

async function pair(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  table: string,
  tsCol: string,
  filters: Array<[string, string, string]>,
): Promise<CountPair> {
  const now = new Date()
  const weekAgo = new Date(now.getTime() - WEEK_MS)
  const twoWeeksAgo = new Date(now.getTime() - 2 * WEEK_MS)
  const [thisWeek, lastWeek] = await Promise.all([
    countInRange(supabase, table, tsCol, filters, weekAgo, now),
    countInRange(supabase, table, tsCol, filters, twoWeeksAgo, weekAgo),
  ])
  return { thisWeek, lastWeek }
}

export async function getPerformanceData(): Promise<PerformanceData> {
  const supabase = await createServerClient()

  const [
    draftsCreated, draftsApproved, draftsPublished,
    judgments, replies, reviewReplies, aiGenerations, boostsLaunched,
  ] = await Promise.all([
    pair(supabase, 'content_drafts',       'created_at', []),
    pair(supabase, 'content_drafts',       'approved_at', [['status', 'eq', 'approved']]),
    pair(supabase, 'social_posts',         'posted_at', []),
    pair(supabase, 'human_judgments',      'created_at', []),
    pair(supabase, 'social_interactions',  'reply_at', [['status', 'eq', 'replied']]),
    pair(supabase, 'local_reviews',        'reply_at', [['status', 'eq', 'replied']]),
    pair(supabase, 'ai_generations',       'created_at', []),
    pair(supabase, 'ad_campaigns',         'launched_at', [['status', 'in', 'active,paused,completed']]),
  ])

  // Top posts (last 60 days) — sorted by total_interactions
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()
  const { data: topPostsRaw } = await supabase
    .from('social_posts')
    .select('id, client_id, platform, caption, permalink, media_url, reach, total_interactions, posted_at')
    .gte('posted_at', sixtyDaysAgo)
    .order('total_interactions', { ascending: false })
    .limit(8)

  const allClientIds = Array.from(new Set((topPostsRaw ?? []).map(p => p.client_id as string)))

  // Per-client activity (this week)
  const now = new Date()
  const weekAgo = new Date(now.getTime() - WEEK_MS).toISOString()

  const [draftsByClientRes, postsByClientRes, reviewsAnsByClientRes, repliesSentByClientRes] = await Promise.all([
    supabase.from('content_drafts').select('client_id').gte('created_at', weekAgo),
    supabase.from('social_posts').select('client_id, total_interactions').gte('posted_at', weekAgo),
    supabase.from('local_reviews').select('client_id').eq('status', 'replied').gte('reply_at', weekAgo),
    supabase.from('social_interactions').select('client_id').eq('status', 'replied').gte('reply_at', weekAgo),
  ])

  const activityMap = new Map<string, ClientActivityRow>()
  const bump = (clientId: string, patch: Partial<ClientActivityRow>) => {
    const row = activityMap.get(clientId) ?? {
      clientId, clientName: null,
      draftCount: 0, publishedCount: 0, totalEngagement: 0,
      reviewsAnswered: 0, repliesSent: 0,
    }
    Object.assign(row, {
      ...row,
      draftCount: row.draftCount + (patch.draftCount ?? 0),
      publishedCount: row.publishedCount + (patch.publishedCount ?? 0),
      totalEngagement: row.totalEngagement + (patch.totalEngagement ?? 0),
      reviewsAnswered: row.reviewsAnswered + (patch.reviewsAnswered ?? 0),
      repliesSent: row.repliesSent + (patch.repliesSent ?? 0),
    })
    activityMap.set(clientId, row)
  }
  for (const r of draftsByClientRes.data ?? []) bump(r.client_id as string, { draftCount: 1 })
  for (const r of postsByClientRes.data ?? []) {
    bump(r.client_id as string, {
      publishedCount: 1,
      totalEngagement: Number(r.total_interactions ?? 0),
    })
  }
  for (const r of reviewsAnsByClientRes.data ?? []) bump(r.client_id as string, { reviewsAnswered: 1 })
  for (const r of repliesSentByClientRes.data ?? []) bump(r.client_id as string, { repliesSent: 1 })

  // Resolve client names
  const allMentionedClients = Array.from(new Set([...allClientIds, ...Array.from(activityMap.keys())]))
  const clientMap = new Map<string, { name: string | null; slug: string | null }>()
  if (allMentionedClients.length > 0) {
    const { data: clients } = await supabase.from('clients').select('id, name, slug').in('id', allMentionedClients)
    for (const c of clients ?? []) {
      clientMap.set(c.id as string, { name: (c.name as string) ?? null, slug: (c.slug as string) ?? null })
    }
  }

  const topPosts: TopPostRow[] = ((topPostsRaw ?? []) as Array<Record<string, unknown>>).map(p => {
    const clientId = p.client_id as string
    const name = clientMap.get(clientId)?.name ?? null
    const reach = Number(p.reach ?? 0)
    const interactions = Number(p.total_interactions ?? 0)
    return {
      postId: p.id as string,
      clientId,
      clientName: name,
      platform: (p.platform as string) ?? 'instagram',
      caption: (p.caption as string) ?? '',
      permalink: (p.permalink as string) ?? null,
      mediaUrl: (p.media_url as string) ?? null,
      reach,
      totalInteractions: interactions,
      engagementRate: reach > 0 ? interactions / reach : null,
      postedAt: (p.posted_at as string) ?? null,
    }
  })

  const clientActivity = Array.from(activityMap.values())
    .map(row => ({ ...row, clientName: clientMap.get(row.clientId)?.name ?? null }))
    .sort((a, b) => (b.publishedCount + b.draftCount + b.repliesSent + b.reviewsAnswered)
                  - (a.publishedCount + a.draftCount + a.repliesSent + a.reviewsAnswered))
    .slice(0, 10)

  const { count: bookSize } = await supabase.from('clients').select('id', { count: 'exact', head: true })

  return {
    counts: {
      draftsCreated, draftsApproved, draftsPublished,
      judgments, replies, reviewReplies, aiGenerations, boostsLaunched,
    },
    topPosts,
    clientActivity,
    bookSize: bookSize ?? 0,
  }
}
