'use server'

/**
 * Strategist console data layer (Q1 wk 7-8, 1.3).
 *
 * One row per client with the signals a strategist needs to triage:
 *   - last contact (most recent client_interaction)
 *   - deliverables due this week
 *   - unanswered reviews
 *   - expiring tokens / disconnected channels
 *   - 24h event count (proxy for "what changed since yesterday")
 *   - needs-attention score
 *
 * One Supabase round-trip per signal, then in-memory join. Fine at
 * 100 clients/strategist; revisit if we cross 500.
 */

import { createAdminClient } from '@/lib/supabase/admin'

export interface ConsoleRow {
  clientId: string
  name: string
  plan: string | null
  status: string | null
  assignedTeamMemberId: string | null
  lastContactAt: string | null
  lastContactSummary: string | null
  deliverablesDueThisWeek: number
  unansweredReviews: number
  badReviewsUnanswered: number
  connectionIssues: number
  events24h: number
  needsAttentionScore: number
}

const DAY_MS = 86400 * 1000

interface DueRow { client_id: string }
interface ReviewSummaryRow { client_id: string; rating: number; response_text: string | null }
interface ConnectionRow { client_id: string; status: string; token_expires_at: string | null }
interface EventRow { client_id: string }
interface InteractionRow { client_id: string; occurred_at: string; summary: string | null }
interface ClientRow {
  id: string
  name: string
  /** Column is `tier` on the clients table — Basic / Standard / Pro / Internal. */
  tier: string | null
  status: string | null
  assigned_team_member_id: string | null
}

export async function getConsoleRows(opts?: {
  /** team_members.id; if set, restricts to that strategist's clients (plus unassigned) */
  strategistId?: string
}): Promise<ConsoleRow[]> {
  const admin = createAdminClient()
  const now = new Date()
  const dayAgo = new Date(now.getTime() - DAY_MS)
  const sevenDaysOut = new Date(now.getTime() + 7 * DAY_MS)

  // 1) Clients in scope.
  let clientsQuery = admin
    .from('clients')
    .select('id, name, tier, status, assigned_team_member_id')
    .neq('status', 'archived')

  if (opts?.strategistId) {
    clientsQuery = clientsQuery.or(
      `assigned_team_member_id.eq.${opts.strategistId},assigned_team_member_id.is.null`
    )
  }

  const { data: clients, error: clientsErr } = await clientsQuery
  if (clientsErr) throw new Error(clientsErr.message)
  const clientIds = (clients ?? []).map(c => c.id)
  if (clientIds.length === 0) return []

  // 2) Pull the signals in parallel.
  const [
    deliverablesRes,
    reviewsRes,
    connectionsRes,
    eventsRes,
    interactionsRes,
  ] = await Promise.all([
    // Active deliverables per client. We do NOT have a deadline column on
    // deliverables, so the original "due this week" query was 500ing. As a
    // proxy we count anything currently in flight (draft / internal_review /
    // client_review / revision_requested). Same intent: "what does the
    // strategist need to move today."
    admin
      .from('deliverables')
      .select('client_id')
      .in('client_id', clientIds)
      .in('status', ['draft', 'internal_review', 'client_review', 'revision_requested']),
    admin
      .from('reviews')
      .select('client_id, rating, response_text')
      .in('client_id', clientIds)
      .is('response_text', null),
    admin
      .from('channel_connections')
      .select('client_id, status, token_expires_at')
      .in('client_id', clientIds),
    admin
      .from('events')
      .select('client_id')
      .in('client_id', clientIds)
      .gte('occurred_at', dayAgo.toISOString()),
    admin
      .from('client_interactions')
      .select('client_id, occurred_at, summary')
      .in('client_id', clientIds)
      .order('occurred_at', { ascending: false }),
  ])

  // 3) In-memory joins.
  const dueByClient = new Map<string, number>()
  for (const d of (deliverablesRes.data ?? []) as DueRow[]) {
    dueByClient.set(d.client_id, (dueByClient.get(d.client_id) ?? 0) + 1)
  }

  const reviewsByClient = new Map<string, { total: number; bad: number }>()
  for (const r of (reviewsRes.data ?? []) as ReviewSummaryRow[]) {
    const cur = reviewsByClient.get(r.client_id) ?? { total: 0, bad: 0 }
    cur.total++
    if (Number(r.rating) <= 3) cur.bad++
    reviewsByClient.set(r.client_id, cur)
  }

  const connIssuesByClient = new Map<string, number>()
  for (const c of (connectionsRes.data ?? []) as ConnectionRow[]) {
    const expiresSoon =
      c.token_expires_at !== null &&
      new Date(c.token_expires_at).getTime() <= sevenDaysOut.getTime()
    if (c.status === 'disconnected' || c.status === 'error' || expiresSoon) {
      connIssuesByClient.set(c.client_id, (connIssuesByClient.get(c.client_id) ?? 0) + 1)
    }
  }

  const eventsByClient = new Map<string, number>()
  for (const e of (eventsRes.data ?? []) as EventRow[]) {
    eventsByClient.set(e.client_id, (eventsByClient.get(e.client_id) ?? 0) + 1)
  }

  const lastContactByClient = new Map<string, { at: string; summary: string | null }>()
  for (const i of (interactionsRes.data ?? []) as InteractionRow[]) {
    if (!lastContactByClient.has(i.client_id)) {
      lastContactByClient.set(i.client_id, { at: i.occurred_at, summary: i.summary })
    }
  }

  // 4) Compose rows + score.
  const rows: ConsoleRow[] = (clients as ClientRow[]).map(c => {
    const due = dueByClient.get(c.id) ?? 0
    const rev = reviewsByClient.get(c.id) ?? { total: 0, bad: 0 }
    const conn = connIssuesByClient.get(c.id) ?? 0
    const score = due * 3 + rev.bad * 2 + conn * 1
    const lc = lastContactByClient.get(c.id)
    return {
      clientId: c.id,
      name: c.name,
      plan: c.tier,
      status: c.status,
      assignedTeamMemberId: c.assigned_team_member_id,
      lastContactAt: lc?.at ?? null,
      lastContactSummary: lc?.summary ?? null,
      deliverablesDueThisWeek: due,
      unansweredReviews: rev.total,
      badReviewsUnanswered: rev.bad,
      connectionIssues: conn,
      events24h: eventsByClient.get(c.id) ?? 0,
      needsAttentionScore: score,
    }
  })

  // Sort: high-score first, then unassigned, then by name.
  rows.sort((a, b) => {
    if (b.needsAttentionScore !== a.needsAttentionScore) {
      return b.needsAttentionScore - a.needsAttentionScore
    }
    if (a.assignedTeamMemberId && !b.assignedTeamMemberId) return 1
    if (!a.assignedTeamMemberId && b.assignedTeamMemberId) return -1
    return a.name.localeCompare(b.name)
  })

  return rows
}
