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
import { getAdminUserIds } from '@/lib/notify'

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
  | 'ai_drafts_ready'
  | 'awaiting_you_digest'
  | 'campaign_wrapped'
  | 'invoice_reminder'
  | 'work_offer'
  // AI transport failure (key dead, credits out, rate limited) — the loud half of law 6.
  | 'ai_failure'
  | 'channel_broken'
  | 'request_update'
  | 'booking_reminder'
  // The count window moved because the work landed later than the order date. One row per
  // re-anchor, written by reanchorPromise (src/lib/promises/record.ts).
  | 'date_moved'

/**
 * Which switch on the owner's Notifications page decides whether an email may go out.
 * The page (src/app/dashboard/settings/notifications/page.tsx) shows these as
 * "Content ready", "Billing and invoices", "Messages" and "System updates".
 */
export type EmailCategory = 'billing' | 'content' | 'messages' | 'system'

const CATEGORY_COLUMN: Record<EmailCategory, 'notify_billing' | 'notify_content_ready' | 'notify_messages' | 'notify_system'> = {
  billing: 'notify_billing',
  content: 'notify_content_ready',
  messages: 'notify_messages',
  system: 'notify_system',
}

/** When a caller does not say, the kind decides. Callers that email SHOULD say. */
function categoryForKind(kind: NotificationKind): EmailCategory {
  if (kind === 'payment' || kind === 'invoice_reminder') return 'billing'
  if (kind === 'date_moved' || kind === 'draft_published' || kind === 'draft_approved' || kind === 'campaign_wrapped') return 'content'
  if (kind === 'request_update' || kind === 'client_request') return 'messages'
  return 'system'
}

/**
 * Of these owners, who has NOT switched this email off?
 *
 * The preferences the owner sets on their Notifications page are real: "Email notifications" off,
 * frequency "Off", or the category switched off all mean do not write to them. A person with no
 * preferences row has never touched the page, so they get the table defaults (send).
 *
 * 'daily' and 'weekly' still send as they happen, because there is no digest job yet. Saying so
 * out loud rather than dropping the email: silence would be worse than a mistimed one.
 */
async function ownersWhoWantEmail(userIds: string[], category: EmailCategory): Promise<Set<string>> {
  const keep = new Set(userIds)
  if (!userIds.length) return keep
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('notification_preferences')
      .select('user_id, email_enabled, email_digest_frequency, notify_billing, notify_content_ready, notify_messages, notify_system')
      .in('user_id', userIds)
    // A read that fails must not silence the product: fall back to the table defaults.
    if (error) {
      console.warn('[notifications] preference read failed; emailing as if default:', error.message)
      return keep
    }
    const column = CATEGORY_COLUMN[category]
    for (const row of (data ?? []) as Record<string, unknown>[]) {
      const off =
        row.email_enabled === false ||
        row.email_digest_frequency === 'off' ||
        row[column] === false
      if (off) keep.delete(row.user_id as string)
    }
  } catch (e) {
    console.warn('[notifications] preference read threw; emailing as if default:', (e as Error)?.message)
  }
  return keep
}

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
 *
 * `alsoAdmins` adds every admin ON TOP of the assignees rather than instead of them. Before a
 * client had a named strategist this fan-out reached the whole admin pool by falling back; the
 * day the strategist row lands it narrows to one person, and one person on holiday is how a paid
 * order goes unseen. Money moving is the event where somebody must always be watching, so the
 * order-placed handoffs opt in. Every other event stays with the person who owns the account.
 */
export async function notifyStaffForClient(
  clientId: string,
  capabilities: string[],
  payload: { kind: NotificationKind; title: string; body?: string; link?: string },
  opts: { alsoAdmins?: boolean } = {},
): Promise<{ notified: number; fellBackToAdmins?: boolean }> {
  const admin = createAdminClient()

  // Find everyone assigned to this client with an active role
  const { data: assignees } = await admin
    .from('role_assignments')
    .select('person_id, role')
    .eq('client_id', clientId)
    .is('ended_at', null)

  let recipients: string[] = []
  if (assignees?.length) {
    const candidateIds = [...new Set(assignees.map(a => a.person_id))]

    // Of those, who has an active capability we care about?
    const { data: caps, error: capsError } = await admin
      .from('person_capabilities')
      .select('person_id, capability')
      .in('person_id', candidateIds)
      .eq('status', 'active')
      .in('capability', [...capabilities, 'admin'])

    // capability is an ENUM: one word that is not in role_capability makes Postgres refuse the
    // whole query, which read here as "nobody is assigned" and paged every admin instead. Say it
    // out loud so a typo is a line in the log, not a permanent quiet fallback.
    if (capsError) {
      console.warn(`[notifications] capability lookup failed for [${capabilities.join(', ')}]:`, capsError.message)
    }
    recipients = [...new Set((caps ?? []).map(c => c.person_id))]
  }

  // Somebody is always watching the money: admins join the assignee, they do not replace them.
  if (opts.alsoAdmins) {
    recipients = [...new Set([...recipients, ...(await getAdminUserIds(admin))])]
  }

  // Safety net: a client with no capable assignee (new or misconfigured) is
  // exactly the one whose ship handoffs and dead-letters must not vanish —
  // route the event to every admin instead of dropping it.
  let fellBackToAdmins = false
  if (!recipients.length) {
    recipients = await getAdminUserIds(admin)
    fellBackToAdmins = true
    console.warn(`[notifications] no capable staff assigned to client ${clientId}; falling back to ${recipients.length} admin(s)`)
    if (!recipients.length) return { notified: 0, fellBackToAdmins }
  }

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
    return { notified: 0, fellBackToAdmins }
  }
  return { notified: recipients.length, fellBackToAdmins }
}

/**
 * Notify every owner of a client (the people on the business side).
 * Resolved by joining `client_users` (the client-portal access table)
 * + `businesses.owner_id` (the legacy single-owner pointer). Returns
 * the count of recipients reached.
 */
export async function notifyClientOwners(
  clientId: string,
  payload: { kind: NotificationKind; title: string; body?: string; link?: string; email?: boolean; emailCategory?: EmailCategory },
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
  // A notification the owner only sees by opening the app is not a notification. The few events
  // that are worth a phone buzzing also go out by email: the order they placed, the work landing,
  // their count starting, their date moving, and a person answering them. Opt-in per call, never
  // a blanket on every kind, so a digest or a nudge can never become a mailshot.
  //
  // The in-app row above is the promise; the email is a courtesy that follows it. Nobody's click
  // waits on Resend: two owner lookups plus an HTTPS round trip to a third party sat in front of
  // the ship response, and a slow Resend made the whole order feel broken. Fire and forget, and
  // say so in the log when it fails, since the row the owner will see is already written.
  if (payload.email) {
    void emailClientOwners(clientId, {
      subject: payload.title,
      body: payload.body,
      link: payload.link,
      category: payload.emailCategory ?? categoryForKind(payload.kind),
    }).catch((e) => console.warn('[notifications] owner email failed:', (e as Error)?.message))
  }
  return { notified: ids.size }
}

/**
 * Email the client's owners the same words the in-app row carries. Best-effort and inert without
 * RESEND_API_KEY (sendEmailIfConfigured logs and returns { sent: false }), so this is safe to wire
 * everywhere today and starts working the day the key lands in Vercel.
 *
 * THE SETTINGS PAGE IS REAL: every recipient is checked against their own notification_preferences
 * row first, per person, so one owner turning email off does not silence their partner and does
 * not get overridden by the other one leaving it on. `category` says which switch decides.
 */
export async function emailClientOwners(
  clientId: string,
  payload: { subject: string; body?: string; link?: string; category?: EmailCategory },
): Promise<{ sent: boolean }> {
  try {
    const { sendEmailIfConfigured, ownerEmailTargetsForClient } = await import('@/lib/email/send')
    const targets = await ownerEmailTargetsForClient(clientId)
    if (!targets.length) return { sent: false }
    const wanted = await ownersWhoWantEmail(targets.map((t) => t.userId), payload.category ?? 'system')
    const to = targets.filter((t) => wanted.has(t.userId)).map((t) => t.email)
    if (!to.length) {
      console.log('[email] every owner has this off; skipped:', payload.subject)
      return { sent: false }
    }
    const base = process.env.NEXT_PUBLIC_APP_URL || 'https://portal.apnosh.com'
    const where = payload.link ? `\n\n${base}${payload.link.startsWith('/') ? payload.link : `/${payload.link}`}` : ''
    return await sendEmailIfConfigured({
      to,
      subject: payload.subject,
      text: `${payload.body ?? payload.subject}${where}\n\nApnosh`,
    })
  } catch (e) {
    console.warn('[notifications] owner email failed:', (e as Error)?.message)
    return { sent: false }
  }
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
