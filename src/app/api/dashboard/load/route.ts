/**
 * GET /api/dashboard/load?clientId=...
 *
 * One consolidated endpoint that returns EVERYTHING the dashboard needs
 * in a single roundtrip. The previous approach made 8+ separate fetches
 * (brief, pulse, weekly, reviews, tasks, approvals, etc.) — each
 * repeating its own auth + profile lookup. That made the page feel
 * sluggish even on a fast network.
 *
 * Speed wins here:
 *   1. One auth check, not eight.
 *   2. All Supabase queries fire in parallel server-side, then we
 *      stream the bundled result back.
 *   3. Brief lookup is cache-only by default; if no cache, we let the
 *      client kick the slow generation in a follow-up call (so the rest
 *      of the dashboard never waits for Claude).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPulseData } from '@/lib/dashboard/get-pulse-data'
import { getWeeklyActivity } from '@/lib/dashboard/get-weekly-activity'
import { getAgenda } from '@/lib/dashboard/get-agenda'
import { getMarketingCalendar, daysUntil } from '@/lib/dashboard/marketing-calendar'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { getCurrentCycleSummary } from '@/lib/services/delivery-matrix'
import { getGoalCards } from '@/lib/dashboard/get-goal-cards'
import { getStrategistForClient } from '@/lib/dashboard/get-strategist'
import { getPlaybookExplanations } from '@/lib/dashboard/get-playbook-explanations'

export const maxDuration = 15

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })

  // One auth check — covers admin, super_admin, profile.client_id, businesses owner, client_users
  const access = await checkClientAccess(clientId)
  if (!access.authorized) {
    const status = access.reason === 'unauthenticated' ? 401 : 403
    return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status })
  }

  const admin = createAdminClient()
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  // Parallel: fire every query at once.
  const [pulse, weekly, agenda, services, goalCards, strategist, playbooks, shapeRow, reviewsRow, briefRow, unansweredCountRow, approvalsCountRow, tasksRow, calendarQueuedRow] = await Promise.all([
    getPulseData(clientId),
    getWeeklyActivity(clientId),
    getAgenda(clientId),
    getCurrentCycleSummary(clientId),
    getGoalCards(clientId),
    getStrategistForClient(clientId),
    getPlaybookExplanations(clientId),
    admin
      .from('clients')
      .select('shape_footprint')
      .eq('id', clientId)
      .maybeSingle(),
    admin
      .from('reviews')
      .select('id, source, rating, author_name, review_text, posted_at, responded_at')
      .eq('client_id', clientId)
      .order('posted_at', { ascending: false })
      .limit(5),
    admin
      .from('ai_generations')
      .select('raw_text, model, created_at')
      .eq('client_id', clientId)
      .eq('task_type', 'dashboard_brief')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from('reviews')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .is('response_text', null),
    admin
      .from('deliverables')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', clientId)
      .eq('status', 'client_review'),
    admin
      .from('client_tasks')
      .select('*')
      .eq('client_id', clientId)
      .eq('visible_to_client', true)
      .in('status', ['todo', 'doing'])
      .order('due_at', { ascending: true, nullsFirst: false })
      .limit(20),
    // Pull all scheduled posts in the next 60 days so we can mark which
    // marketing-calendar moments already have content queued.
    admin
      .from('scheduled_posts')
      .select('scheduled_for')
      .eq('client_id', clientId)
      .in('status', ['scheduled', 'publishing'])
      .gte('scheduled_for', new Date().toISOString())
      .lte('scheduled_for', new Date(Date.now() + 60 * 86400000).toISOString()),
  ])

  // Filter out snoozed tasks
  const nowMs = Date.now()
  const tasks = (tasksRow.data ?? []).filter((t: { snoozed_until?: string | null }) =>
    !t.snoozed_until || new Date(t.snoozed_until).getTime() <= nowMs
  )

  // Build comingUp by joining the static calendar against scheduled posts.
  // For each event, count posts scheduled within ±2 days of the event date.
  const calendar = getMarketingCalendar(new Date(), 60)
  const queuedDates = (calendarQueuedRow.data ?? [])
    .map(r => r.scheduled_for as string)
    .filter(Boolean)
  const comingUp = calendar.slice(0, 6).map(e => {
    const eventTime = new Date(e.date).getTime()
    const queuedCount = queuedDates.filter(d => {
      const t = new Date(d).getTime()
      return Math.abs(t - eventTime) <= 2 * 86400000
    }).length
    return {
      date: e.date,
      label: e.label,
      hook: e.hook,
      weight: e.weight,
      daysUntil: daysUntil(e.date),
      queuedCount,
    }
  })

  return NextResponse.json({
    pulse,
    weekly,
    agenda,
    services,
    goalCards,
    strategist,
    playbooks,
    setup: {
      shapeSet: !!shapeRow.data?.shape_footprint,
      goalsSet: goalCards.length > 0,
      anyChannelConnected:
        pulse.customers.state === 'live' ||
        pulse.reach.state === 'live' ||
        pulse.reputation.state === 'live',
    },
    comingUp,
    reviews: reviewsRow.data ?? [],
    brief: briefRow.data ? {
      text: briefRow.data.raw_text,
      generatedAt: briefRow.data.created_at,
      model: briefRow.data.model,
      cached: true,
    } : null,
    counts: {
      unansweredReviews: unansweredCountRow.count ?? 0,
      pendingApprovals: approvalsCountRow.count ?? 0,
    },
    tasks,
  })
}
