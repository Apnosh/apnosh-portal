'use server'

/**
 * Composes the "morning paper" data block for the Today hero.
 *
 * Three stages drive UI:
 *   - 'new'        -- just-set-up; no connections yet; lead with onboarding
 *   - 'active'     -- connections exist and there's real activity to report
 *   - 'caught_up'  -- has data but nothing urgent right now
 *
 * Returns structured data the TodayHero client component renders into
 * the morning narrative + needs-you action list + this-week proof list.
 *
 * Per docs/PRODUCT-SPEC.md: this is the centerpiece surface. Every
 * Tier 2 owner should be able to log in, read the hero in 30 seconds,
 * and know exactly what to do today.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { getActiveClientGoals, getClientShape } from '@/lib/goals/queries'
import type { GoalSlug } from '@/lib/goals/types'

export type TodayStage = 'new' | 'active' | 'caught_up'

export interface NeedsYouItem {
  /** Short verb-led label, e.g. "Reply to Sarah's 3-star review" */
  label: string
  /** Optional one-line context */
  detail?: string
  /** Where to send the owner */
  href: string
  /** Urgency: 'high' shows red, 'medium' amber, 'low' plain */
  urgency: 'high' | 'medium' | 'low'
  /** Optional icon hint */
  kind?: 'review' | 'approval' | 'connection' | 'task' | 'content'
}

export interface ThisWeekItem {
  /** What's planned, e.g. "Monday: 2 Mother's Day posts (drafted)" */
  label: string
  /** Optional detail */
  detail?: string
  /** Status chip text, e.g. "Drafted", "Scheduled", "Shipped" */
  status?: string
  /** Where the owner can review/approve */
  href?: string
}

export interface RecentActivityItem {
  /** Human line, e.g. "Mark drafted a Mother's Day post" */
  label: string
  /** When it happened (ISO) -- rendered relative ("2 hours ago") */
  whenIso: string
  /** Activity kind drives the icon */
  kind: 'strategist' | 'content' | 'review' | 'system'
  /** Optional click-through */
  href?: string
}

export interface GoalProgressLine {
  slug: GoalSlug
  priority: 1 | 2 | 3
  label: string                    // owner-facing goal name
  state: 'no_data' | 'flat' | 'up' | 'down'
  signalLine?: string              // e.g. "Reach +12% w/w" or "Connect GBP to start tracking"
  href?: string
}

export interface TodayHeroData {
  stage: TodayStage
  /** Headline: one factual sentence to lead with, e.g. "Holding steady this week." */
  headline: string
  /** Data summary for AI-narrative generation (kept simple/structured). */
  context: {
    clientName: string
    activeGoals: GoalSlug[]
    hasShape: boolean
    connections: { gbp: boolean; instagram: boolean; facebook: boolean; analytics: boolean }
    counts: {
      unrepliedReviews: number
      pendingApprovals: number
      tasksDue: number
      scheduledPostsThisWeek: number
      newReviewsLast7d: number
    }
  }
  needsYou: NeedsYouItem[]
  thisWeek: ThisWeekItem[]
  recentActivity: RecentActivityItem[]
  goalLines: GoalProgressLine[]
  /** ISO date this snapshot was computed (drives cache + freshness). */
  computedAt: string
}

const GOAL_LABEL: Record<GoalSlug, string> = {
  more_foot_traffic: 'more foot traffic',
  regulars_more_often: 'regulars coming back',
  more_online_orders: 'more online orders',
  more_reservations: 'more reservations',
  better_reputation: 'better reputation',
  be_known_for: 'be known as the spot',
  fill_slow_times: 'filling slow times',
  grow_catering: 'growing catering',
}

const PRIMARY_CONNECTION_FOR_GOAL: Record<GoalSlug, { channel: string; label: string; href: string }> = {
  more_foot_traffic: { channel: 'gbp', label: 'Connect Google Business Profile', href: '/dashboard/connected-accounts' },
  better_reputation: { channel: 'gbp', label: 'Connect review sources', href: '/dashboard/connected-accounts' },
  be_known_for: { channel: 'instagram', label: 'Connect Instagram', href: '/dashboard/connected-accounts' },
  regulars_more_often: { channel: 'email', label: 'Connect your customer list', href: '/dashboard/connected-accounts' },
  more_online_orders: { channel: 'website', label: 'Connect your ordering platform', href: '/dashboard/connected-accounts' },
  more_reservations: { channel: 'website', label: 'Connect your reservation system', href: '/dashboard/connected-accounts' },
  fill_slow_times: { channel: 'email', label: 'Connect your customer list', href: '/dashboard/connected-accounts' },
  grow_catering: { channel: 'website', label: 'Connect your catering inquiry form', href: '/dashboard/connected-accounts' },
}

export async function getTodayHero(clientId: string): Promise<TodayHeroData> {
  const admin = createAdminClient()
  const now = new Date()
  const d2 = new Date(now.getTime() - 2 * 86400000)
  const d7 = new Date(now.getTime() - 7 * 86400000)
  const w7 = new Date(now.getTime() + 7 * 86400000)

  const [clientRow, shape, goals, connRows, unrepRev, pendApprovals, tasksRow, weekPostsRow, recentReviewsRow, recentEventsRow] = await Promise.all([
    admin.from('clients').select('name').eq('id', clientId).maybeSingle(),
    getClientShape(clientId),
    getActiveClientGoals(clientId),
    admin.from('channel_connections').select('channel, status').eq('client_id', clientId).eq('status', 'active'),
    admin.from('reviews').select('id, author_name, rating, posted_at', { count: 'exact' }).eq('client_id', clientId).is('response_text', null).order('posted_at', { ascending: false }).limit(3),
    admin.from('deliverables').select('id', { count: 'exact', head: true }).eq('client_id', clientId).eq('status', 'client_review'),
    admin.from('client_tasks').select('id, title, due_at').eq('client_id', clientId).eq('visible_to_client', true).in('status', ['todo', 'doing']).order('due_at', { ascending: true, nullsFirst: false }).limit(5),
    admin.from('scheduled_posts').select('id, status, scheduled_for, text', { count: 'exact' }).eq('client_id', clientId).gte('scheduled_for', now.toISOString()).lte('scheduled_for', w7.toISOString()).in('status', ['scheduled', 'approved', 'in_review']).order('scheduled_for', { ascending: true }).limit(5),
    admin.from('reviews').select('id', { count: 'exact', head: true }).eq('client_id', clientId).gte('posted_at', d7.toISOString()),
    admin.from('events').select('event_type, summary, occurred_at, actor_role, subject_type, subject_id').eq('client_id', clientId).gte('occurred_at', d2.toISOString()).order('occurred_at', { ascending: false }).limit(8),
  ])

  const clientName = (clientRow.data?.name as string) ?? 'there'

  // Map connections.
  const channels = new Set((connRows.data ?? []).map(r => r.channel as string))
  const connections = {
    gbp: channels.has('google_business_profile'),
    instagram: channels.has('instagram'),
    facebook: channels.has('facebook'),
    analytics: channels.has('google_analytics'),
  }

  const counts = {
    unrepliedReviews: unrepRev.count ?? unrepRev.data?.length ?? 0,
    pendingApprovals: pendApprovals.count ?? 0,
    tasksDue: tasksRow.data?.length ?? 0,
    scheduledPostsThisWeek: weekPostsRow.count ?? weekPostsRow.data?.length ?? 0,
    newReviewsLast7d: recentReviewsRow.count ?? 0,
  }

  const hasAnyConnection = Object.values(connections).some(Boolean)
  const stage: TodayStage = !hasAnyConnection
    ? 'new'
    : (counts.unrepliedReviews + counts.pendingApprovals + counts.tasksDue > 0)
      ? 'active'
      : 'caught_up'

  // ── needsYou ─────────────────────────────────────────────
  const needsYou: NeedsYouItem[] = []

  // Bad reviews waiting for a reply jump to the top.
  for (const r of (unrepRev.data ?? [])) {
    const rating = Number(r.rating)
    const urgency: 'high' | 'medium' = rating <= 3 ? 'high' : 'medium'
    needsYou.push({
      label: `Reply to ${r.author_name ?? 'a customer'}'s ${rating}-star review`,
      detail: rating <= 3 ? 'Replying within 24 hours measurably improves perception.' : undefined,
      href: '/dashboard/local-seo/reviews',
      urgency,
      kind: 'review',
    })
    if (needsYou.length >= 2) break
  }

  // Pending content approvals
  if (counts.pendingApprovals > 0) {
    needsYou.push({
      label: `${counts.pendingApprovals} item${counts.pendingApprovals === 1 ? '' : 's'} waiting for your approval`,
      href: '/dashboard/approvals',
      urgency: counts.pendingApprovals >= 3 ? 'high' : 'medium',
      kind: 'approval',
    })
  }

  // New-client connection gaps for active goals
  if (stage === 'new') {
    const suggestedConnections = new Map<string, { label: string; href: string }>()
    for (const g of goals) {
      const c = PRIMARY_CONNECTION_FOR_GOAL[g.goalSlug]
      if (!c) continue
      const alreadyConnected =
        (c.channel === 'gbp' && connections.gbp) ||
        (c.channel === 'instagram' && connections.instagram)
      if (alreadyConnected) continue
      if (!suggestedConnections.has(c.channel)) {
        suggestedConnections.set(c.channel, { label: c.label, href: c.href })
      }
    }
    for (const sc of suggestedConnections.values()) {
      needsYou.push({
        label: sc.label,
        href: sc.href,
        urgency: 'medium',
        kind: 'connection',
      })
      if (needsYou.length >= 3) break
    }
  }

  // Client tasks the strategist surfaced for them
  for (const t of (tasksRow.data ?? [])) {
    if (needsYou.length >= 3) break
    needsYou.push({
      label: t.title as string,
      href: '/dashboard/inbox',
      urgency: 'low',
      kind: 'task',
    })
  }

  // ── thisWeek (proof of motion from the team) ────────────
  const thisWeek: ThisWeekItem[] = []
  for (const p of (weekPostsRow.data ?? [])) {
    const when = new Date(p.scheduled_for as string)
    const day = when.toLocaleString('en-US', { weekday: 'long' })
    const preview = ((p.text as string) ?? '').slice(0, 60).replace(/\s+/g, ' ')
    thisWeek.push({
      label: `${day}: post${preview ? ` — "${preview}${(p.text as string).length > 60 ? '...' : ''}"` : ''}`,
      status: p.status === 'in_review' ? 'In review' : p.status === 'approved' ? 'Approved' : 'Scheduled',
      href: '/dashboard/social/calendar',
    })
    if (thisWeek.length >= 4) break
  }

  // ── goalLines (one-liner per active goal) ───────────────
  const goalLines: GoalProgressLine[] = goals.map(g => {
    const conn = PRIMARY_CONNECTION_FOR_GOAL[g.goalSlug]
    const hasRequiredConnection =
      !conn ||
      (conn.channel === 'gbp' && connections.gbp) ||
      (conn.channel === 'instagram' && connections.instagram) ||
      (conn.channel === 'website' && connections.analytics) ||
      (conn.channel === 'email')
    if (!hasRequiredConnection) {
      return {
        slug: g.goalSlug,
        priority: g.priority,
        label: GOAL_LABEL[g.goalSlug],
        state: 'no_data' as const,
        signalLine: `${conn.label} to start tracking.`,
        href: conn.href,
      }
    }
    return {
      slug: g.goalSlug,
      priority: g.priority,
      label: GOAL_LABEL[g.goalSlug],
      state: 'flat' as const,
      signalLine: 'Tracking — first signal lands within a week.',
      href: undefined,
    }
  })

  // ── recentActivity (events feed, last 48h) ───────────────
  const recentActivity: RecentActivityItem[] = []
  for (const e of (recentEventsRow.data ?? [])) {
    const summary = (e.summary as string) ?? ''
    if (!summary) continue
    const eventType = (e.event_type as string) ?? ''
    const actorRole = (e.actor_role as string) ?? ''
    let kind: RecentActivityItem['kind'] = 'system'
    let href: string | undefined
    if (actorRole === 'strategist' || actorRole === 'admin') {
      kind = 'strategist'
    } else if (eventType.startsWith('scheduled_post')) {
      kind = 'content'
      href = '/dashboard/social/calendar'
    } else if (eventType.startsWith('review')) {
      kind = 'review'
      href = '/dashboard/local-seo/reviews'
    }
    recentActivity.push({
      label: summary,
      whenIso: e.occurred_at as string,
      kind,
      href,
    })
    if (recentActivity.length >= 5) break
  }

  // ── headline ────────────────────────────────────────────
  let headline = ''
  if (stage === 'new') {
    const goalCount = goals.length
    if (goalCount === 0) {
      headline = `Welcome, ${clientName}. Set 1–3 goals to get started.`
    } else {
      const topGoal = GOAL_LABEL[goals[0].goalSlug]
      headline = `Welcome, ${clientName}. Your top goal is ${topGoal} — let's set up the data behind it.`
    }
  } else if (stage === 'active') {
    const bits: string[] = []
    if (counts.unrepliedReviews > 0) bits.push(`${counts.unrepliedReviews} review${counts.unrepliedReviews === 1 ? '' : 's'} need${counts.unrepliedReviews === 1 ? 's' : ''} your reply`)
    if (counts.pendingApprovals > 0) bits.push(`${counts.pendingApprovals} approval${counts.pendingApprovals === 1 ? '' : 's'} waiting`)
    headline = bits.length > 0 ? `Today: ${bits.join(', ')}.` : `Things are moving.`
  } else {
    headline = `You're caught up. Nothing urgent on the marketing front.`
  }

  return {
    stage,
    headline,
    context: {
      clientName,
      activeGoals: goals.map(g => g.goalSlug),
      hasShape: !!shape?.footprint,
      connections,
      counts,
    },
    needsYou,
    thisWeek,
    recentActivity,
    goalLines,
    computedAt: new Date().toISOString(),
  }
}
