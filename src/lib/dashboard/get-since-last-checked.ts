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
  /** Icon key for the timeline node (post/star/reply/plug/user/check/edit/send). */
  icon?: string
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

const EVENT_TYPE_ICONS: Record<string, string> = {
  'draft.published_to_platforms': 'post',
  'draft.client_signed_off': 'check',
  'draft.client_revise_requested': 'edit',
  'client_request.created': 'send',
  'client_request.accepted': 'check',
  'review.posted': 'star',
  'review.replied': 'reply',
  'connection.connected': 'plug',
  'connection.broken': 'plug',
  'team.specialist_assigned': 'user',
  'team.swap_resolved': 'user',
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

/* How far back "since you were here" looks. Reviews and replies inside this
   window count as recent activity worth surfacing. */
const WINDOW_DAYS = 30

interface RawEvent { id: string; occurredAt: string; text: string; extra?: string; emphasis: TimelineUrgency; icon?: string }

export async function getSinceLastChecked(
  clientId: string,
  limit = 5,
): Promise<TimelineEvent[]> {
  const admin = createAdminClient()
  const sinceIso = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString()

  /* Two real sources:
       1. The events audit log (posts going live, team activity) — used when
          it's actually populated.
       2. Reviews + replies — the activity owners care about most, and the
          source that reliably has data. */
  const [eventsRes, reviewsRes] = await Promise.all([
    admin
      .from('events')
      .select('id, event_type, summary, occurred_at')
      .eq('client_id', clientId)
      .in('event_type', Object.keys(EVENT_TYPE_LABELS))
      .gte('occurred_at', sinceIso)
      .order('occurred_at', { ascending: false })
      .limit(limit * 2),
    admin
      .from('reviews')
      .select('id, author_name, rating, posted_at, responded_at, source')
      .eq('client_id', clientId)
      .or(`posted_at.gte.${sinceIso},responded_at.gte.${sinceIso}`)
      .order('posted_at', { ascending: false })
      .limit(20),
  ])

  const raw: RawEvent[] = []

  for (const e of (eventsRes.data ?? []) as Array<{ id: string; event_type: string; summary: string | null; occurred_at: string }>) {
    const labelFn = EVENT_TYPE_LABELS[e.event_type]
    if (!labelFn) continue
    const text = labelFn(e.summary ?? null)
    if (!text) continue
    raw.push({
      id: `ev_${e.id}`,
      occurredAt: e.occurred_at,
      text,
      emphasis: POSITIVE_TYPES.has(e.event_type) ? 'win' : MUTED_TYPES.has(e.event_type) ? 'mute' : 'info',
      icon: EVENT_TYPE_ICONS[e.event_type] ?? 'dot',
    })
  }

  for (const r of (reviewsRes.data ?? []) as Array<{ id: string; author_name: string | null; rating: number | null; posted_at: string | null; responded_at: string | null; source: string | null }>) {
    const who = r.author_name?.trim() || 'A customer'
    const stars = Math.max(1, Math.min(5, Math.round(Number(r.rating ?? 0))))
    if (r.posted_at && r.posted_at >= sinceIso) {
      raw.push({
        id: `rv_${r.id}`,
        occurredAt: r.posted_at,
        text: `New ${stars}★ review`,
        extra: who,
        emphasis: stars >= 4 ? 'win' : 'info',
        icon: 'star',
      })
    }
    if (r.responded_at && r.responded_at >= sinceIso) {
      raw.push({
        id: `rp_${r.id}`,
        occurredAt: r.responded_at,
        text: `Replied to ${who}’s review`,
        emphasis: 'win',
        icon: 'reply',
      })
    }
  }

  if (!raw.length) return []

  raw.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1))

  /* The most recent "win" becomes the headline (filled dot). */
  const bigId = raw.find(e => e.emphasis === 'win')?.id ?? null

  return raw.slice(0, limit).map(e => ({
    id: e.id,
    whenLabel: relativeLabel(e.occurredAt),
    text: e.text,
    emphasis: e.emphasis,
    big: e.id === bigId,
    extra: e.extra,
  }))
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
