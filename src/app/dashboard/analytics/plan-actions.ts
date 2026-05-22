'use server'

/**
 * Owner-plan CRUD for the Plan calendar.
 *
 *   createPlan / updatePlan / deletePlan (soft) / restorePlan
 *
 * Auth pattern mirrors the inbox actions: resolve the current user +
 * client via resolveCurrentClient, then write through the service-role
 * admin client. Authorisation rules:
 *   - non-admin: locked to their own resolved clientId
 *   - admin:     may act on the clientId they're viewing (passed in)
 * Edits/deletes additionally verify the target row belongs to that
 * client (admins may touch any client they explicitly target).
 */

import { revalidatePath } from 'next/cache'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { createAdminClient } from '@/lib/supabase/admin'
import { createNotification } from '@/lib/notify'
import type { PlanKind, PlanStatus } from '@/lib/dashboard/get-plans'

export interface PlanInput {
  title: string
  kind: PlanKind
  notes?: string | null
  startDate: string            // 'YYYY-MM-DD'
  endDate?: string | null      // 'YYYY-MM-DD' or null
  allDay?: boolean
  startTime?: string | null    // 'HH:MM' or null
  status?: PlanStatus
  /** Admin-only: which client this plan belongs to. Ignored for clients. */
  clientId?: string
}

type Result<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string }

const KINDS: PlanKind[] = ['promotion', 'event', 'special', 'content', 'holiday', 'reminder']
const STATUSES: PlanStatus[] = ['idea', 'planned', 'done']
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^\d{2}:\d{2}$/

/** Resolve + authorise the acting client context. */
async function resolveActor(passedClientId?: string): Promise<
  | { ok: true; clientId: string; isAdmin: boolean; userId: string }
  | { ok: false; error: string }
> {
  const resolved = await resolveCurrentClient(passedClientId ?? null)
  if (!resolved.user) return { ok: false, error: 'Not authenticated' }
  const clientId = resolved.isAdmin ? (passedClientId ?? resolved.clientId) : resolved.clientId
  if (!clientId) return { ok: false, error: 'No client in context' }
  return { ok: true, clientId, isAdmin: resolved.isAdmin, userId: resolved.user.id }
}

/** Verify a plan row exists and the actor may modify it. */
async function loadOwned(
  admin: ReturnType<typeof createAdminClient>,
  id: string,
  actor: { clientId: string; isAdmin: boolean },
): Promise<Result<{ clientId: string }>> {
  const { data, error } = await admin
    .from('owner_plans')
    .select('client_id')
    .eq('id', id)
    .maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'Plan not found' }
  const owner = data.client_id as string
  if (!actor.isAdmin && owner !== actor.clientId) {
    return { ok: false, error: 'Not allowed' }
  }
  return { ok: true, data: { clientId: owner } }
}

function validate(input: Partial<PlanInput>): string | null {
  if (input.title !== undefined && !input.title.trim()) return 'Title is required'
  if (input.kind !== undefined && !KINDS.includes(input.kind)) return 'Invalid kind'
  if (input.status !== undefined && !STATUSES.includes(input.status)) return 'Invalid status'
  if (input.startDate !== undefined && !DATE_RE.test(input.startDate)) return 'Invalid start date'
  if (input.endDate != null && !DATE_RE.test(input.endDate)) return 'Invalid end date'
  if (input.endDate != null && input.startDate != null && input.endDate < input.startDate) {
    return 'End date is before start date'
  }
  if (input.startTime != null && !TIME_RE.test(input.startTime)) return 'Invalid time'
  return null
}

function revalidate() {
  revalidatePath('/dashboard/analytics')
  revalidatePath('/dashboard/calendar')
}

export async function createPlan(input: PlanInput): Promise<Result<{ id: string }>> {
  const actor = await resolveActor(input.clientId)
  if (!actor.ok) return actor

  const err = validate(input)
  if (err) return { ok: false, error: err }

  const allDay = input.allDay !== false
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('owner_plans')
    .insert({
      client_id: actor.clientId,
      title: input.title.trim(),
      kind: input.kind,
      notes: input.notes?.trim() || null,
      start_date: input.startDate,
      end_date: input.endDate || null,
      all_day: allDay,
      start_time: allDay ? null : (input.startTime || null),
      status: input.status ?? 'planned',
      created_by: actor.userId,
    })
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }

  revalidate()
  return { ok: true, data: { id: data.id as string } }
}

export async function updatePlan(id: string, patch: Partial<PlanInput>): Promise<Result> {
  if (!id) return { ok: false, error: 'Missing id' }
  const actor = await resolveActor(patch.clientId)
  if (!actor.ok) return actor

  const err = validate(patch)
  if (err) return { ok: false, error: err }

  const admin = createAdminClient()
  const owned = await loadOwned(admin, id, actor)
  if (!owned.ok) return owned

  const row: Record<string, unknown> = {}
  if (patch.title !== undefined) row.title = patch.title.trim()
  if (patch.kind !== undefined) row.kind = patch.kind
  if (patch.notes !== undefined) row.notes = patch.notes?.trim() || null
  if (patch.startDate !== undefined) row.start_date = patch.startDate
  if (patch.endDate !== undefined) row.end_date = patch.endDate || null
  if (patch.status !== undefined) row.status = patch.status
  if (patch.allDay !== undefined) {
    row.all_day = patch.allDay
    if (patch.allDay) row.start_time = null
  }
  if (patch.startTime !== undefined && patch.allDay !== true) {
    row.start_time = patch.startTime || null
  }
  if (Object.keys(row).length === 0) return { ok: true }

  const { error } = await admin.from('owner_plans').update(row).eq('id', id)
  if (error) return { ok: false, error: error.message }

  revalidate()
  return { ok: true }
}

/** Soft delete — sets deleted_at so the item drops out of the calendar
 *  but can be restored. */
export async function deletePlan(id: string, clientId?: string): Promise<Result> {
  if (!id) return { ok: false, error: 'Missing id' }
  const actor = await resolveActor(clientId)
  if (!actor.ok) return actor

  const admin = createAdminClient()
  const owned = await loadOwned(admin, id, actor)
  if (!owned.ok) return owned

  const { error } = await admin
    .from('owner_plans')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { ok: false, error: error.message }

  revalidate()
  return { ok: true }
}

export async function restorePlan(id: string, clientId?: string): Promise<Result> {
  if (!id) return { ok: false, error: 'Missing id' }
  const actor = await resolveActor(clientId)
  if (!actor.ok) return actor

  const admin = createAdminClient()
  const owned = await loadOwned(admin, id, actor)
  if (!owned.ok) return owned

  const { error } = await admin.from('owner_plans').update({ deleted_at: null }).eq('id', id)
  if (error) return { ok: false, error: error.message }

  revalidate()
  return { ok: true }
}

/* ───────────────────────── Collaboration ─────────────────────────
 * Sharing a plan across accounts: set who can see it (visibility) and
 * who is on it (participants). Authorisation is membership-based on the
 * plan's own client, so an agency strategist assigned to that client can
 * manage it even though it is not "their" client in the single-client
 * sense. People accept or decline their own participation. */

const PARTICIPANT_ROLES = [
  'owner', 'manager', 'strategist', 'photographer', 'videographer',
  'editor', 'influencer', 'copywriter', 'ad_buyer', 'community_mgr', 'vendor',
]

/** Resolve just the acting user (collaboration spans clients, so we do
 *  not lock to a single resolved clientId here). */
async function resolveUser(): Promise<
  | { ok: true; userId: string; isAdmin: boolean }
  | { ok: false; error: string }
> {
  const r = await resolveCurrentClient(null)
  if (!r.user) return { ok: false, error: 'Not authenticated' }
  return { ok: true, userId: r.user.id, isAdmin: r.isAdmin }
}

/** Is this user an owner / team member / assigned agency person of the client. */
async function isClientMember(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  clientId: string,
): Promise<boolean> {
  const [biz, cu, ra] = await Promise.all([
    admin.from('businesses').select('client_id').eq('owner_id', userId).eq('client_id', clientId).limit(1),
    admin.from('client_users').select('client_id').eq('auth_user_id', userId).eq('client_id', clientId).limit(1),
    admin.from('role_assignments').select('client_id').eq('person_id', userId).eq('client_id', clientId).is('ended_at', null).limit(1),
  ])
  return !!(biz.data?.length || cu.data?.length || ra.data?.length)
}

/** Load a plan and authorise the actor to manage its sharing. */
async function loadManageable(
  admin: ReturnType<typeof createAdminClient>,
  planId: string,
  userId: string,
  isAdmin: boolean,
): Promise<Result<{ clientId: string }>> {
  const { data, error } = await admin
    .from('owner_plans')
    .select('client_id, created_by')
    .eq('id', planId)
    .maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'Plan not found' }
  const clientId = data.client_id as string
  const createdBy = (data.created_by as string | null) ?? null
  if (isAdmin || createdBy === userId || (await isClientMember(admin, userId, clientId))) {
    return { ok: true, data: { clientId } }
  }
  return { ok: false, error: 'Not allowed' }
}

export async function setPlanVisibility(planId: string, visibility: 'private' | 'team'): Promise<Result> {
  if (!planId) return { ok: false, error: 'Missing id' }
  if (visibility !== 'private' && visibility !== 'team') return { ok: false, error: 'Invalid visibility' }
  const u = await resolveUser()
  if (!u.ok) return u
  const admin = createAdminClient()
  const m = await loadManageable(admin, planId, u.userId, u.isAdmin)
  if (!m.ok) return m
  const { error } = await admin.from('owner_plans').update({ visibility }).eq('id', planId)
  if (error) return { ok: false, error: error.message }
  revalidate()
  return { ok: true }
}

/** Add (or re-invite) a participant. Adding yourself auto-accepts. */
export async function addParticipant(planId: string, personId: string, role?: string): Promise<Result> {
  if (!planId || !personId) return { ok: false, error: 'Missing id' }
  const u = await resolveUser()
  if (!u.ok) return u
  const admin = createAdminClient()
  const m = await loadManageable(admin, planId, u.userId, u.isAdmin)
  if (!m.ok) return m
  const cleanRole = role && PARTICIPANT_ROLES.includes(role) ? role : null
  const status = personId === u.userId ? 'accepted' : 'invited'
  const { error } = await admin
    .from('plan_participants')
    .upsert(
      { plan_id: planId, person_id: personId, role: cleanRole, invited_by: u.userId, status },
      { onConflict: 'plan_id,person_id' },
    )
  if (error) return { ok: false, error: error.message }

  // Let the person know they're on a plan.
  if (status === 'invited') {
    const { data: plan } = await admin.from('owner_plans').select('title').eq('id', planId).maybeSingle()
    await createNotification({
      supabase: admin,
      userId: personId,
      type: 'system',
      title: 'Added to a plan',
      body: `You were added to "${(plan?.title as string) || 'a plan'}".`,
      link: '/dashboard/analytics',
    })
  }

  revalidate()
  return { ok: true }
}

export async function removeParticipant(planId: string, personId: string): Promise<Result> {
  if (!planId || !personId) return { ok: false, error: 'Missing id' }
  const u = await resolveUser()
  if (!u.ok) return u
  const admin = createAdminClient()
  const m = await loadManageable(admin, planId, u.userId, u.isAdmin)
  if (!m.ok) return m
  const { error } = await admin.from('plan_participants').delete().eq('plan_id', planId).eq('person_id', personId)
  if (error) return { ok: false, error: error.message }
  revalidate()
  return { ok: true }
}

/** A participant accepts or declines their own seat on a plan. */
export async function respondToParticipation(planId: string, response: 'accepted' | 'declined'): Promise<Result> {
  if (!planId) return { ok: false, error: 'Missing id' }
  if (response !== 'accepted' && response !== 'declined') return { ok: false, error: 'Invalid response' }
  const u = await resolveUser()
  if (!u.ok) return u
  const admin = createAdminClient()
  const { error } = await admin
    .from('plan_participants')
    .update({ status: response, responded_at: new Date().toISOString() })
    .eq('plan_id', planId)
    .eq('person_id', u.userId)
  if (error) return { ok: false, error: error.message }
  revalidate()
  return { ok: true }
}

/* ───────────────────────────── Notes ─────────────────────────────
 * Per-plan notes. Each note is private to its author, shared with the
 * people on the plan, or sent to the client's strategist (which notifies
 * them). Anyone who can see the plan may add a note. */

type NoteVisibility = 'private' | 'shared' | 'strategist'
const NOTE_VIS: NoteVisibility[] = ['private', 'shared', 'strategist']

export interface PlanNote {
  id: string
  body: string
  visibility: NoteVisibility
  createdAt: string
  authorId: string
  authorName: string
  mine: boolean
}

/** Authorise that the actor can see this plan (broader than manage). */
async function canAccessPlan(
  admin: ReturnType<typeof createAdminClient>,
  planId: string,
  userId: string,
  isAdmin: boolean,
): Promise<Result<{ clientId: string; title: string; isStrategist: boolean }>> {
  const { data, error } = await admin
    .from('owner_plans')
    .select('client_id, created_by, title')
    .eq('id', planId)
    .maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'Plan not found' }
  const clientId = data.client_id as string

  let isStrategist = isAdmin
  if (!isStrategist) {
    const { data: st } = await admin
      .from('role_assignments')
      .select('role')
      .eq('person_id', userId)
      .eq('client_id', clientId)
      .is('ended_at', null)
      .in('role', ['strategist', 'admin'])
      .limit(1)
    isStrategist = !!(st && st.length)
  }

  let access = isAdmin || data.created_by === userId || (await isClientMember(admin, userId, clientId))
  if (!access) {
    const { data: pp } = await admin
      .from('plan_participants')
      .select('plan_id')
      .eq('plan_id', planId)
      .eq('person_id', userId)
      .neq('status', 'declined')
      .limit(1)
    access = !!(pp && pp.length)
  }
  if (!access) return { ok: false, error: 'Not allowed' }
  return { ok: true, data: { clientId, title: (data.title as string) ?? '', isStrategist } }
}

export async function addNote(planId: string, body: string, visibility: NoteVisibility = 'private'): Promise<Result<{ id: string }>> {
  if (!planId) return { ok: false, error: 'Missing id' }
  const text = (body || '').trim()
  if (!text) return { ok: false, error: 'Note is empty' }
  if (!NOTE_VIS.includes(visibility)) return { ok: false, error: 'Invalid visibility' }
  const u = await resolveUser()
  if (!u.ok) return u
  const admin = createAdminClient()
  const acc = await canAccessPlan(admin, planId, u.userId, u.isAdmin)
  if (!acc.ok) return acc
  if (!acc.data) return { ok: false, error: 'Plan not found' }

  const { data, error } = await admin
    .from('plan_notes')
    .insert({ plan_id: planId, author_id: u.userId, body: text, visibility })
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }

  // "Sent to strategist" notifies the client's strategist(s).
  if (visibility === 'strategist') {
    const { data: strat } = await admin
      .from('role_assignments')
      .select('person_id')
      .eq('client_id', acc.data.clientId)
      .eq('role', 'strategist')
      .is('ended_at', null)
    for (const s of strat ?? []) {
      const sid = s.person_id as string | null
      if (sid && sid !== u.userId) {
        await createNotification({
          supabase: admin,
          userId: sid,
          type: 'message',
          title: 'New note on a plan',
          body: `A note was sent to you on "${acc.data.title || 'a plan'}".`,
          link: '/dashboard/analytics',
        })
      }
    }
  }

  revalidate()
  return { ok: true, data: { id: data.id as string } }
}

export async function deleteNote(noteId: string): Promise<Result> {
  if (!noteId) return { ok: false, error: 'Missing id' }
  const u = await resolveUser()
  if (!u.ok) return u
  const admin = createAdminClient()
  const { data, error } = await admin.from('plan_notes').select('author_id').eq('id', noteId).maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'Note not found' }
  if (!u.isAdmin && data.author_id !== u.userId) return { ok: false, error: 'Not allowed' }
  const { error: delErr } = await admin.from('plan_notes').delete().eq('id', noteId)
  if (delErr) return { ok: false, error: delErr.message }
  revalidate()
  return { ok: true }
}

/** Notes on a plan that this viewer is allowed to see. */
export async function getPlanNotes(planId: string): Promise<PlanNote[]> {
  if (!planId) return []
  const u = await resolveUser()
  if (!u.ok) return []
  const admin = createAdminClient()
  const acc = await canAccessPlan(admin, planId, u.userId, u.isAdmin)
  if (!acc.ok || !acc.data) return []
  const ctx = acc.data

  const { data } = await admin
    .from('plan_notes')
    .select('id, body, visibility, created_at, author_id')
    .eq('plan_id', planId)
    .order('created_at', { ascending: true })

  const rows = (data ?? []).filter(n =>
    n.author_id === u.userId ||
    n.visibility === 'shared' ||
    (n.visibility === 'strategist' && ctx.isStrategist),
  )
  const ids = [...new Set(rows.map(r => r.author_id as string))]
  const nameById: Record<string, string> = {}
  if (ids.length) {
    const { data: profs } = await admin.from('profiles').select('id, full_name, email').in('id', ids)
    for (const p of profs ?? []) nameById[p.id as string] = ((p.full_name as string) || (p.email as string) || 'Someone').trim()
  }
  return rows.map(n => ({
    id: n.id as string,
    body: n.body as string,
    visibility: n.visibility as NoteVisibility,
    createdAt: n.created_at as string,
    authorId: n.author_id as string,
    authorName: nameById[n.author_id as string] ?? 'Someone',
    mine: n.author_id === u.userId,
  }))
}
