'use server'

/**
 * Unified calendar feed for /dashboard/calendar.
 *
 * Folds together everything that has a date on it for the owner:
 *   - Scheduled social posts          (publishing)
 *   - Scheduled email campaigns       (publishing)
 *   - Filming / photo shoots          (production)
 *   - Planned content calendar items  (production)
 *   - Owner tasks with due dates      (task)
 *
 * Returns a single time-ordered array. The view layer groups by day,
 * filters by category, and renders either an agenda list or a month grid.
 *
 * `shoot_plans` is tenant-keyed by business_id, not client_id, so we
 * resolve the client's businesses first and query by that set.
 */

import { createAdminClient } from '@/lib/supabase/admin'

export type CalendarEventKind = 'post' | 'email' | 'shoot' | 'content' | 'task'
export type CalendarCategory = 'publishing' | 'production' | 'task'
export type CalendarTone = 'green' | 'amber' | 'red' | 'gray' | 'blue'

export interface CalendarEvent {
  id: string
  kind: CalendarEventKind
  category: CalendarCategory
  title: string
  detail?: string
  /** ISO timestamp; for all-day events we still emit a wall-clock time. */
  startIso: string
  allDay: boolean
  status: string
  statusTone: CalendarTone
  href?: string
  platforms?: string[]
}

export interface CalendarRange {
  fromIso?: string
  toIso?: string
}

export async function getCalendar(
  clientId: string,
  range: CalendarRange = {}
): Promise<CalendarEvent[]> {
  const admin = createAdminClient()
  const from = range.fromIso ?? new Date(Date.now() - 7 * 86_400_000).toISOString()
  const to = range.toIso ?? new Date(Date.now() + 60 * 86_400_000).toISOString()
  const fromDate = from.slice(0, 10)
  const toDate = to.slice(0, 10)

  // shoot_plans is tied to businesses, not clients. Resolve first.
  const { data: bizRows } = await admin
    .from('businesses')
    .select('id')
    .eq('client_id', clientId)
  const businessIds = (bizRows ?? []).map(b => b.id as string)

  const [postsRow, emailsRow, shootsRow, ccRow, tasksRow] = await Promise.all([
    admin
      .from('scheduled_posts')
      .select('id, text, status, scheduled_for, platforms')
      .eq('client_id', clientId)
      .not('scheduled_for', 'is', null)
      .gte('scheduled_for', from)
      .lte('scheduled_for', to)
      .order('scheduled_for', { ascending: true })
      .limit(300),
    admin
      .from('email_campaigns')
      .select('id, name, subject, status, scheduled_for')
      .eq('client_id', clientId)
      .not('scheduled_for', 'is', null)
      .gte('scheduled_for', from)
      .lte('scheduled_for', to)
      .order('scheduled_for', { ascending: true })
      .limit(100),
    businessIds.length
      ? admin
          .from('shoot_plans')
          .select('id, shoot_date, location, duration_minutes, status, business_id')
          .in('business_id', businessIds)
          .gte('shoot_date', fromDate)
          .lte('shoot_date', toDate)
          .order('shoot_date', { ascending: true })
          .limit(50)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    admin
      .from('content_calendar_items')
      .select('id, concept_title, scheduled_date, scheduled_time, platform, content_type')
      .eq('client_id', clientId)
      .not('scheduled_date', 'is', null)
      .gte('scheduled_date', fromDate)
      .lte('scheduled_date', toDate)
      .order('scheduled_date', { ascending: true })
      .limit(300),
    admin
      .from('client_tasks')
      .select('id, title, body, due_at, status')
      .eq('client_id', clientId)
      .eq('visible_to_client', true)
      .in('status', ['todo', 'doing'])
      .not('due_at', 'is', null)
      .gte('due_at', from)
      .lte('due_at', to)
      .order('due_at', { ascending: true })
      .limit(100),
  ])

  const events: CalendarEvent[] = []

  for (const p of postsRow.data ?? []) {
    const text = (p.text as string) ?? ''
    const preview = text.slice(0, 70).replace(/\s+/g, ' ')
    const platforms = (p.platforms as string[] | null) ?? []
    events.push({
      id: `post-${p.id}`,
      kind: 'post',
      category: 'publishing',
      title: preview || 'Scheduled post',
      detail: platforms.length ? platforms.join(' · ') : undefined,
      startIso: p.scheduled_for as string,
      allDay: false,
      status: postStatusLabel(p.status as string),
      statusTone: postStatusTone(p.status as string),
      href: '/dashboard/social/calendar',
      platforms,
    })
  }

  for (const e of emailsRow.data ?? []) {
    events.push({
      id: `email-${e.id}`,
      kind: 'email',
      category: 'publishing',
      title: (e.subject as string) || (e.name as string) || 'Email campaign',
      detail: e.subject && e.name && e.subject !== e.name ? (e.name as string) : undefined,
      startIso: e.scheduled_for as string,
      allDay: false,
      status: emailStatusLabel(e.status as string),
      statusTone: emailStatusTone(e.status as string),
      href: '/dashboard/email-sms',
    })
  }

  for (const s of shootsRow.data ?? []) {
    const date = s.shoot_date as string
    const iso = new Date(`${date}T09:00:00`).toISOString()
    const dur = s.duration_minutes as number | null
    const detailParts = [s.location as string | null, dur ? `${dur} min` : null].filter(Boolean)
    events.push({
      id: `shoot-${s.id}`,
      kind: 'shoot',
      category: 'production',
      title: 'Filming / Photo shoot',
      detail: detailParts.length ? (detailParts.join(' · ') as string) : undefined,
      startIso: iso,
      allDay: true,
      status: shootStatusLabel(s.status as string),
      statusTone: shootStatusTone(s.status as string),
    })
  }

  for (const c of ccRow.data ?? []) {
    const date = c.scheduled_date as string
    const time = (c.scheduled_time as string) ?? '12:00:00'
    const iso = new Date(`${date}T${time}`).toISOString()
    events.push({
      id: `content-${c.id}`,
      kind: 'content',
      category: 'production',
      title: (c.concept_title as string) || 'Content piece',
      detail: [c.platform, c.content_type].filter(Boolean).join(' · ') || undefined,
      startIso: iso,
      allDay: !c.scheduled_time,
      status: 'Planned',
      statusTone: 'blue',
    })
  }

  for (const t of tasksRow.data ?? []) {
    const due = new Date(t.due_at as string)
    const overdue = due.getTime() < Date.now()
    events.push({
      id: `task-${t.id}`,
      kind: 'task',
      category: 'task',
      title: t.title as string,
      detail: (t.body as string) ?? undefined,
      startIso: t.due_at as string,
      allDay: false,
      status: overdue ? 'Overdue' : 'Due',
      statusTone: overdue ? 'red' : 'amber',
      href: '/dashboard/inbox',
    })
  }

  events.sort((a, b) => new Date(a.startIso).getTime() - new Date(b.startIso).getTime())
  return events
}

function postStatusLabel(s: string): string {
  switch (s) {
    case 'scheduled': return 'Scheduled'
    case 'in_review': return 'In review'
    case 'draft': return 'Draft'
    case 'publishing': return 'Publishing'
    case 'published': return 'Published'
    case 'failed':
    case 'partially_failed': return 'Failed'
    default: return s
  }
}
function postStatusTone(s: string): CalendarTone {
  if (s === 'scheduled') return 'green'
  if (s === 'in_review' || s === 'publishing') return 'amber'
  if (s === 'failed' || s === 'partially_failed') return 'red'
  if (s === 'published') return 'gray'
  return 'gray'
}
function emailStatusLabel(s: string): string {
  switch (s) {
    case 'scheduled': return 'Scheduled'
    case 'in_review': return 'In review'
    case 'approved': return 'Approved'
    case 'sending': return 'Sending'
    case 'sent': return 'Sent'
    default: return s
  }
}
function emailStatusTone(s: string): CalendarTone {
  if (s === 'scheduled' || s === 'approved') return 'green'
  if (s === 'in_review' || s === 'sending') return 'amber'
  return 'gray'
}
function shootStatusLabel(s: string): string {
  switch (s) {
    case 'planned': return 'Planned'
    case 'confirmed': return 'Confirmed'
    case 'completed': return 'Completed'
    case 'cancelled': return 'Cancelled'
    default: return s
  }
}
function shootStatusTone(s: string): CalendarTone {
  if (s === 'confirmed') return 'green'
  if (s === 'planned') return 'blue'
  if (s === 'cancelled') return 'red'
  return 'gray'
}
