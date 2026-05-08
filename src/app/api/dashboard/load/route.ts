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
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPulseData } from '@/lib/dashboard/get-pulse-data'
import { getWeeklyActivity } from '@/lib/dashboard/get-weekly-activity'

export const maxDuration = 15

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })

  // Single auth check — every sub-query then runs as the admin (server-side)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, client_id')
    .eq('id', user.id)
    .maybeSingle()
  let authorized = profile?.role === 'admin' || profile?.client_id === clientId
  if (!authorized) {
    const { data: membership } = await supabase
      .from('client_users')
      .select('client_id')
      .eq('auth_user_id', user.id)
      .eq('client_id', clientId)
      .maybeSingle()
    if (membership) authorized = true
  }
  if (!authorized) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const admin = createAdminClient()
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  // Parallel: fire every query at once.
  const [pulse, weekly, reviewsRow, briefRow, unansweredCountRow, approvalsCountRow, tasksRow] = await Promise.all([
    getPulseData(clientId),
    getWeeklyActivity(clientId),
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
  ])

  // Filter out snoozed tasks
  const nowMs = Date.now()
  const tasks = (tasksRow.data ?? []).filter((t: { snoozed_until?: string | null }) =>
    !t.snoozed_until || new Date(t.snoozed_until).getTime() <= nowMs
  )

  return NextResponse.json({
    pulse,
    weekly,
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
