'use server'

/**
 * "Since you last checked" timeline feed for the dashboard.
 *
 * Pulls recent events for this client, filters to the kinds an owner
 * actually cares about (published posts, review activity, content
 * approved/published, milestones), and labels them in plain English.
 *
 * Marks the most-impactful recent event as "big" so the UI can
 * emphasize it. Currently picks the first published-post event in
 * the window since those are usually the freshest win.
 */

import { createAdminClient } from '@/lib/supabase/admin'

export type TimelineUrgency = 'win' | 'info' | 'mute'

export interface TimelineEvent {
  id: string
  whenLabel: string
  text: string
  emphasis: TimelineUrgency
  /** True for the headline event — UI shows it with a filled dot. */
  big: boolean
  /** Optional second-line context. */
  extra?: string
}

const EVENT_TYPE_LABELS: Record<string, (summary: string | null) => string | null> = {
  'draft.published_to_platforms': (s) => s ?? 'Post went live',
  'draft.client_signed_off': () => 'You signed off on a post',
  'draft.client_revise_requested': () => 'You requested revisions',
  'client_request.created': () => 'You sent a content request',
  'client_request.accepted': () => 'Your strategist accepted a request',
  'review.posted': (s) => s ?? 'New review came in',
  'review.replied': (s) => s ?? 'Your team replied to a review',
  'connection.connected': (s) => s ?? 'Connection completed',
  'connection.broken': (s) => s ?? 'A connection broke',
  'team.specialist_assigned': (s) => s ?? 'Someone joined your team',
  'team.swap_resolved': () => 'Your strategist resolved a team request',
}

const POSITIVE_TYPES = new Set([
  'draft.published_to_platforms',
  'review.replied',
  'team.specialist_assigned',
  'connection.connected',
])

const MUTED_TYPES = new Set([
  'client_request.created',
  'draft.client_revise_requested',
])

export async function getSinceLastChecked(
  clientId: string,
  limit = 5,
): Promise<TimelineEvent[]> {
  const admin = createAdminClient()

  /* Pull more than we'll show — some event types get filtered out,
     and we want the result list to land near the cap even after. */
  const { data: events } = await admin
    .from('events')
    .select('id, event_type, summary, payload, occurred_at, actor_role')
    .eq('client_id', clientId)
    .in('event_type', Object.keys(EVENT_TYPE_LABELS))
    .order('occurred_at', { ascending: false })
    .limit(limit * 2)

  if (!events?.length) return []

  /* The first published-post in the window becomes the "big" event.
     Falls back to the most recent positive event if no publish. */
  let bigId: string | null = null
  for (const e of events) {
    if (e.event_type === 'draft.published_to_platforms') { bigId = e.id as string; break }
  }
  if (!bigId) {
    for (const e of events) {
      if (POSITIVE_TYPES.has(e.event_type as string)) { bigId = e.id as string; break }
    }
  }

  const out: TimelineEvent[] = []
  for (const e of events) {
    const type = e.event_type as string
    const labelFn = EVENT_TYPE_LABELS[type]
    if (!labelFn) continue
    const text = labelFn((e.summary as string) ?? null)
    if (!text) continue

    const emphasis: TimelineUrgency =
      POSITIVE_TYPES.has(type) ? 'win'
      : MUTED_TYPES.has(type) ? 'mute'
      : 'info'

    out.push({
      id: e.id as string,
      whenLabel: relativeLabel(e.occurred_at as string),
      text,
      emphasis,
      big: e.id === bigId,
    })
    if (out.length >= limit) break
  }

  return out
}

/** Compact time labels like 'YESTERDAY', 'SUN 9PM', 'FRI'. */
function relativeLabel(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffH = diffMs / 3_600_000
  if (diffH < 1) return 'Just now'
  if (diffH < 24 && now.getDate() === date.getDate()) {
    const h = date.getHours()
    const m = date.getMinutes().toString().padStart(2, '0')
    const ampm = h >= 12 ? 'pm' : 'am'
    const h12 = h % 12 === 0 ? 12 : h % 12
    return `Today ${h12}:${m}${ampm}`.toUpperCase()
  }
  const diffD = Math.floor(diffMs / 86_400_000)
  if (diffD === 1) return 'YESTERDAY'
  if (diffD < 7) {
    return date.toLocaleString('en-US', { weekday: 'short', hour: 'numeric', hour12: true }).toUpperCase()
  }
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()
}
