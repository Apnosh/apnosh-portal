'use server'

/**
 * Server data layer for the Social Media hub.
 *
 * The hub answers three questions in five seconds:
 *   1. Is anything being posted? (proof of work)
 *   2. Anything I need to do? (approvals + ideas)
 *   3. Did the last thing work? Should we push it harder? (perf + boost)
 *
 * Everything below maps to one of those three.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { getLatestCompletedCampaign, type CampaignRow } from './get-campaigns'
import { getContentPlan, type ContentPlan } from './get-content-plan'
import { getPendingQuotes, type ContentQuote } from './get-quotes'

export interface SocialHubData {
  /** Counts shown as clickable tiles in the hero. */
  counts: {
    /** Published in the rolling 30 days. */
    live: number
    /** Status = scheduled with a future scheduled_for. */
    queued: number
    /** Awaiting client approval (in_review on scheduled_posts). */
    needsYou: number
  }
  /** One-line narrative composed from the data. */
  narrative: string
  /** Last 12 published posts, newest first. */
  recent: SocialPostCard[]
  /** Next 5 scheduled posts, soonest first. */
  upcoming: SocialPostCard[]
  /** Best-performing recent post for the boost CTA. May be null. */
  topPerformer: TopPerformer | null
  /** Total reach across the last 30 days, when available. */
  reach30d: number | null
  /** Most recently completed boost — drives the "Last boost result" card. */
  lastCompletedBoost: CampaignRow | null
  /** The client's current plan + monthly usage. */
  plan: ContentPlan
  /** Quotes the client needs to act on (sent or revising). */
  pendingQuotes: ContentQuote[]
}

export interface SocialPostCard {
  id: string
  text: string
  mediaUrl: string | null
  mediaType: 'image' | 'video' | 'carousel' | null
  platforms: string[]
  scheduledFor: string | null
  publishedAt: string | null
  status: string
}

export interface TopPerformer {
  postId: string
  text: string
  mediaUrl: string | null
  platforms: string[]
  publishedAt: string | null
  reach: number
  engagement: number
  vsAverage: number | null
}

const DAY_MS = 86_400_000

export async function getSocialHub(clientId: string): Promise<SocialHubData> {
  const admin = createAdminClient()
  const now = Date.now()
  const thirtyAgo = new Date(now - 30 * DAY_MS).toISOString()
  const future = new Date(now + 60 * DAY_MS).toISOString()

  const [recentRow, upcomingRow, needsYouRow, queuedRow, perfRow, reachRow, lastCompletedBoost, plan, pendingQuotes] = await Promise.all([
    // Recent published posts
    admin
      .from('scheduled_posts')
      .select('id, text, media_urls, media_type, platforms, scheduled_for, status, updated_at')
      .eq('client_id', clientId)
      .eq('status', 'published')
      .order('scheduled_for', { ascending: false, nullsFirst: false })
      .order('updated_at', { ascending: false })
      .limit(12),
    // Upcoming scheduled
    admin
      .from('scheduled_posts')
      .select('id, text, media_urls, media_type, platforms, scheduled_for, status')
      .eq('client_id', clientId)
      .eq('status', 'scheduled')
      .not('scheduled_for', 'is', null)
      .gte('scheduled_for', new Date(now).toISOString())
      .lte('scheduled_for', future)
      .order('scheduled_for', { ascending: true })
      .limit(5),
    // Awaiting approval
    admin
      .from('scheduled_posts')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .in('status', ['in_review', 'draft']),
    // Total queued (scheduled but not yet live)
    admin
      .from('scheduled_posts')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .eq('status', 'scheduled')
      .gte('scheduled_for', new Date(now).toISOString()),
    // Performance signals for top performer
    admin
      .from('content_performance')
      .select('id, deliverable_id, calendar_entry_id, reach, engagement, impressions, engagement_rate, performance_tier')
      .eq('client_id', clientId)
      .gte('recorded_at', thirtyAgo)
      .order('reach', { ascending: false, nullsFirst: false })
      .limit(5),
    // Rolling 30d reach from daily aggregates
    admin
      .from('social_metrics')
      .select('reach')
      .eq('client_id', clientId)
      .gte('metric_date', thirtyAgo.slice(0, 10))
      .limit(2000),
    // Most recently completed boost (for the "Last boost result" card)
    getLatestCompletedCampaign(clientId),
    // Plan (tier + monthly allotment + usage so far)
    getContentPlan(clientId),
    // Pending quotes (sent / revising)
    getPendingQuotes(clientId),
  ])

  const recent: SocialPostCard[] = (recentRow.data ?? []).map(toCard)
  const upcoming: SocialPostCard[] = (upcomingRow.data ?? []).map(toCard)

  const counts = {
    live: recent.length, // close enough for "shipped recently"
    queued: queuedRow.count ?? 0,
    needsYou: needsYouRow.count ?? 0,
  }

  const reach30d = (reachRow.data ?? []).reduce(
    (s, r) => s + Number(r.reach ?? 0),
    0,
  ) || null

  // Top performer: prefer content_performance, fall back to most recent post.
  let topPerformer: TopPerformer | null = null
  const perfRows = perfRow.data ?? []
  if (perfRows.length > 0 && recent.length > 0) {
    const winner = perfRows[0]
    const avgReach = perfRows.reduce((s, p) => s + Number(p.reach ?? 0), 0) / perfRows.length
    const winnerReach = Number(winner.reach ?? 0)
    const vsAverage = avgReach > 0 ? Math.round(((winnerReach - avgReach) / avgReach) * 100) : null
    // Try to match the perf row to a recent post for display
    const match = recent.find(p => p.id === winner.deliverable_id || p.id === winner.calendar_entry_id)
      ?? recent[0]
    topPerformer = {
      postId: match.id,
      text: match.text,
      mediaUrl: match.mediaUrl,
      platforms: match.platforms,
      publishedAt: match.scheduledFor ?? match.publishedAt,
      reach: winnerReach,
      engagement: Number(winner.engagement ?? 0),
      vsAverage,
    }
  }

  const narrative = composeNarrative({
    live: counts.live,
    queued: counts.queued,
    needsYou: counts.needsYou,
    reach30d,
  })

  return { counts, narrative, recent, upcoming, topPerformer, reach30d, lastCompletedBoost, plan, pendingQuotes }
}

function toCard(r: Record<string, unknown>): SocialPostCard {
  const media = (r.media_urls as string[] | null) ?? []
  return {
    id: r.id as string,
    text: ((r.text as string) ?? '').slice(0, 240),
    mediaUrl: media[0] ?? null,
    mediaType: (r.media_type as SocialPostCard['mediaType']) ?? null,
    platforms: (r.platforms as string[] | null) ?? [],
    scheduledFor: (r.scheduled_for as string | null) ?? null,
    publishedAt: (r.updated_at as string | null) ?? null,
    status: r.status as string,
  }
}

function composeNarrative({
  live, queued, needsYou, reach30d,
}: { live: number; queued: number; needsYou: number; reach30d: number | null }): string {
  if (live === 0 && queued === 0 && needsYou === 0) {
    return 'Your social feed gets going within a day or two of kickoff. Drafts your strategist queues up will show here as they land.'
  }
  const parts: string[] = []
  if (live > 0) parts.push(`${live} live in the last month`)
  if (queued > 0) parts.push(`${queued} queued`)
  if (needsYou > 0) parts.push(`${needsYou} waiting on you`)
  const lead = humanList(parts)
  if (reach30d && reach30d > 200) {
    return `${lead}. Reaching about ${formatCompact(reach30d)} people this month.`
  }
  return `${lead}.`
}

function humanList(items: string[]): string {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0]
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return items.slice(0, -1).join(', ') + ', and ' + items[items.length - 1]
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return `${n}`
}
