'use server'

/**
 * Planner data layer for /dashboard/analytics (repurposed into "Plan").
 *
 * Two kinds of items live in the unified calendar:
 *   - OwnerPlan      — the client's own marketing moments. Editable.
 *                      Backed by the owner_plans table (migration 153).
 *   - ScheduledItem  — what Apnosh has scheduled FOR the client
 *                      (posts, emails, shoots, content, tasks). Read-only.
 *                      Sourced from getCalendar().
 *
 * getPlannerData() returns both so the view can render one calendar.
 * Every query is guarded — if owner_plans doesn't exist yet (migration
 * not applied) or a fetch fails, we degrade to an empty plan list
 * rather than blanking the page.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { getCalendar, type CalendarEvent } from '@/lib/dashboard/get-calendar'

export type PlanKind =
  | 'promotion'
  | 'event'
  | 'special'
  | 'content'
  | 'holiday'
  | 'reminder'

export type PlanStatus = 'idea' | 'planned' | 'done'

export interface OwnerPlan {
  id: string
  title: string
  kind: PlanKind
  notes: string | null
  /** 'YYYY-MM-DD' */
  startDate: string
  /** 'YYYY-MM-DD' or null for a single-day item */
  endDate: string | null
  allDay: boolean
  /** 'HH:MM' or null when allDay */
  startTime: string | null
  status: PlanStatus
}

/** A read-only item from the Apnosh content pipeline, normalised for
 *  the planner's day grid. */
export interface ScheduledItem {
  id: string
  title: string
  detail: string | null
  /** 'YYYY-MM-DD' */
  date: string
  /** 'HH:MM' or null for all-day */
  time: string | null
  kind: CalendarEvent['kind']
  status: string
  href: string | null
}

export interface PlannerData {
  plans: OwnerPlan[]
  scheduled: ScheduledItem[]
}

const VALID_KINDS: PlanKind[] = ['promotion', 'event', 'special', 'content', 'holiday', 'reminder']
const VALID_STATUS: PlanStatus[] = ['idea', 'planned', 'done']

function toKind(v: unknown): PlanKind {
  return VALID_KINDS.includes(v as PlanKind) ? (v as PlanKind) : 'event'
}
function toStatus(v: unknown): PlanStatus {
  return VALID_STATUS.includes(v as PlanStatus) ? (v as PlanStatus) : 'planned'
}
/** Trim a TIME value ('14:30:00') to 'HH:MM'. */
function trimTime(v: unknown): string | null {
  if (typeof v !== 'string' || !v) return null
  return v.slice(0, 5)
}

/**
 * All non-deleted owner plans for a client, oldest first. We load the
 * full set (a restaurant has tens, not thousands) so month navigation
 * and the agenda view never need a refetch.
 */
export async function getPlans(clientId: string): Promise<OwnerPlan[]> {
  if (!clientId) return []
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('owner_plans')
      .select('id, title, kind, notes, start_date, end_date, all_day, start_time, status')
      .eq('client_id', clientId)
      .is('deleted_at', null)
      .order('start_date', { ascending: true })
      .limit(1000)
    if (error) throw error
    return (data ?? []).map((r): OwnerPlan => ({
      id: r.id as string,
      title: (r.title as string) ?? '',
      kind: toKind(r.kind),
      notes: (r.notes as string | null) ?? null,
      startDate: (r.start_date as string).slice(0, 10),
      endDate: r.end_date ? (r.end_date as string).slice(0, 10) : null,
      allDay: r.all_day !== false,
      startTime: r.all_day === false ? trimTime(r.start_time) : null,
      status: toStatus(r.status),
    }))
  } catch (e) {
    console.error('[get-plans] getPlans', e)
    return []
  }
}

/** Normalise getCalendar() output into the planner's day-keyed shape. */
function toScheduledItems(events: CalendarEvent[]): ScheduledItem[] {
  return events.map((e): ScheduledItem => {
    const d = new Date(e.startIso)
    const date = isNaN(d.getTime()) ? e.startIso.slice(0, 10) : d.toISOString().slice(0, 10)
    const time = e.allDay
      ? null
      : (isNaN(d.getTime()) ? null : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`)
    return {
      id: e.id,
      title: e.title,
      detail: e.detail ?? null,
      date,
      time,
      kind: e.kind,
      status: e.status,
      href: e.href ?? null,
    }
  })
}

/**
 * Unified planner payload: the client's own plans plus the agency's
 * scheduled content over a generous window (~1 month back, 6 ahead)
 * so the calendar has context as the user navigates.
 */
export async function getPlannerData(clientId: string): Promise<PlannerData> {
  if (!clientId) return { plans: [], scheduled: [] }

  const fromIso = new Date(Date.now() - 31 * 86_400_000).toISOString()
  const toIso = new Date(Date.now() + 183 * 86_400_000).toISOString()

  const [plans, events] = await Promise.all([
    getPlans(clientId),
    getCalendar(clientId, { fromIso, toIso }).catch((e) => {
      console.error('[get-plans] getCalendar', e)
      return [] as CalendarEvent[]
    }),
  ])

  return { plans, scheduled: toScheduledItems(events) }
}
