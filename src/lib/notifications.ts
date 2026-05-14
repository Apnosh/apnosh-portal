/**
 * In-portal notification helpers.
 *
 * One row per (recipient, event). Producer-side fan-out: when an
 * event (client request, sign-off, revise) needs to notify N staff,
 * we insert N rows. Read state is per-row so each recipient clears
 * their own.
 *
 * Schema (today): id, user_id, type, title, body, link, read_at, created_at.
 * Forward-compat columns (client_id, payload) land via migration 122
 * but we don't depend on them — extra context is encoded in `link`.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createServerClient } from '@/lib/supabase/server'

export type NotificationKind =
  | 'client_request'
  | 'client_signoff'
  | 'client_revise'
  | 'draft_approved'
  | 'draft_published'
  | 'payment'
  | 'holiday_hours_reminder'
  | 'traffic_anomaly'
  | 'site_audit'

export interface NotificationRow {
  id: string
  user_id: string
  type: string
  title: string
  body: string | null
  link: string | null
  read_at: string | null
  created_at: string
}

interface CreateInput {
  userId: string
  kind: NotificationKind
  title: string
  body?: string
  link?: string
}

/**
 * Create one notification row. No-throw — errors are logged and
 * swallowed so a notification failure never breaks the action that
 * triggered it.
 */
export async function createNotification(input: CreateInput): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.from('notifications').insert({
    user_id: input.userId,
    type: input.kind,
    title: input.title,
    body: input.body ?? null,
    link: input.link ?? null,
  })
  if (error) {
    console.warn('[notifications] insert failed:', error.message, 'kind=', input.kind)
  }
}

/**
 * Fan a single event out to every staff person assigned to `clientId`
 * who currently holds ANY of the given capabilities. Used for inbox
 * notifications — strategist + copywriter + community_mgr all see
 * "new client request" alerts.
 *
 * Capability is checked via `person_capabilities`; assignment via
 * `role_assignments`. Both must be active.
 */
export async function notifyStaffForClient(
  clientId: string,
  capabilities: string[],
  payload: { kind: NotificationKind; title: string; body?: string; link?: string },
): Promise<{ notified: number }> {
  const admin = createAdminClient()

  // Find everyone assigned to this client with an active role
  const { data: assignees } = await admin
    .from('role_assignments')
    .select('person_id, role')
    .eq('client_id', clientId)
    .is('ended_at', null)

  if (!assignees?.length) return { notified: 0 }

  const candidateIds = [...new Set(assignees.map(a => a.person_id))]

  // Of those, who has an active capability we care about?
  const { data: caps } = await admin
    .from('person_capabilities')
    .select('person_id, capability')
    .in('person_id', candidateIds)
    .eq('status', 'active')
    .in('capability', [...capabilities, 'admin'])

  const recipients = [...new Set((caps ?? []).map(c => c.person_id))]
  if (!recipients.length) return { notified: 0 }

  const rows = recipients.map(uid => ({
    user_id: uid,
    type: payload.kind,
    title: payload.title,
    body: payload.body ?? null,
    link: payload.link ?? null,
  }))

  const { error } = await admin.from('notifications').insert(rows)
  if (error) {
    console.warn('[notifications] fan-out failed:', error.message)
    return { notified: 0 }
  }
  return { notified: recipients.length }
}

/**
 * Notify every owner of a client (the people on the business side).
 * Resolved by joining `client_users` (the client-portal access table)
 * + `businesses.owner_id` (the legacy single-owner pointer). Returns
 * the count of recipients reached.
 */
export async function notifyClientOwners(
  clientId: string,
  payload: { kind: NotificationKind; title: string; body?: string; link?: string },
): Promise<{ notified: number }> {
  const admin = createAdminClient()

  const [cuRes, bizRes] = await Promise.all([
    admin.from('client_users').select('auth_user_id').eq('client_id', clientId),
    admin.from('businesses').select('owner_id').eq('client_id', clientId),
  ])

  const ids = new Set<string>()
  for (const r of cuRes.data ?? []) {
    if (r.auth_user_id) ids.add(r.auth_user_id as string)
  }
  for (const r of bizRes.data ?? []) {
    if (r.owner_id) ids.add(r.owner_id as string)
  }
  if (ids.size === 0) return { notified: 0 }

  const rows = [...ids].map(uid => ({
    user_id: uid,
    type: payload.kind,
    title: payload.title,
    body: payload.body ?? null,
    link: payload.link ?? null,
  }))

  const { error } = await admin.from('notifications').insert(rows)
  if (error) {
    console.warn('[notifications] client-owner fan-out failed:', error.message)
    return { notified: 0 }
  }
  return { notified: ids.size }
}

/**
 * Load the most recent N notifications for the current user. Returns
 * empty array if signed out — caller doesn't need to handle auth.
 */
export async function listForCurrentUser(limit = 12): Promise<NotificationRow[]> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from('notifications')
    .select('id, user_id, type, title, body, link, read_at, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data as NotificationRow[]) ?? []
}

/**
 * Count unread for the current user. Cheap enough to call on every
 * /work request as part of the layout.
 */
export async function unreadCountForCurrentUser(): Promise<number> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 0

  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .is('read_at', null)
  return count ?? 0
}

/**
 * Mark all unread notifications read for the current user. Called
 * when the bell dropdown opens.
 */
export async function markAllReadForCurrentUser(): Promise<{ marked: number }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { marked: 0 }

  const { data } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .is('read_at', null)
    .select('id')
  return { marked: data?.length ?? 0 }
}
