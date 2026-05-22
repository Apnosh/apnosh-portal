'use server'

/**
 * Unified, viewer-centric plan feed for the collaborative planner.
 *
 * Given the logged-in person, it merges everything they are allowed to
 * see into one normalized list:
 *   - owner_plans they created, are a participant on, or that are shared
 *     with a restaurant team they belong to (visibility = 'team')
 *   - shoots they lead, are crew on, or that belong to a client they are
 *     on (the new shoots + shoot_crew tables, which are cross-account)
 *   - agency content (deliverables, posts, emails, content production)
 *     for the clients they own or are assigned to, via getCalendar
 *
 * This is what makes a photoshoot show up for both the photographer and
 * the restaurant owner, and deadlines show for everyone involved.
 *
 * Self-serve safety: when a client has no strategist, hasStrategist is
 * false and the UI hides the "send to strategist" affordances. The feed
 * still returns the owner's own plans and any vendors they booked.
 *
 * All queries run through the service-role admin client; RLS (migration
 * 154) is defense-in-depth for any direct client access.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { getCalendar, type CalendarEvent } from '@/lib/dashboard/get-calendar'
import type { PlanKind, PlanStatus } from '@/lib/dashboard/get-plans'

export interface PlanPerson {
  id: string
  name: string
  role: string | null
  avatarUrl: string | null
}

export type FeedSource = 'owner' | 'shoot' | 'agency'

export interface PlanFeedItem {
  id: string
  source: FeedSource
  clientId: string
  clientName: string | null
  title: string
  detail: string | null
  /** owner: PlanKind · shoot: 'shoot' · agency: CalendarEvent kind */
  kind: string
  /** 'YYYY-MM-DD' */
  startDate: string
  endDate: string | null
  allDay: boolean
  /** 'HH:MM' or null */
  startTime: string | null
  status: string
  /** Can the current viewer edit this item in the planner. */
  editable: boolean
  visibility?: 'private' | 'team'
  repeat?: string
  participants: PlanPerson[]
  href: string | null
}

export interface PlanFeed {
  items: PlanFeedItem[]
  /** Restaurants the viewer has a stake in (for the client switcher). */
  clients: { id: string; name: string | null }[]
  /** True when the scoped client(s) have an assigned strategist. */
  hasStrategist: boolean
  /** Items waiting on the owner's approval (for the "needs you" strip). */
  approvals: number
  viewerId: string
}

const VALID_KINDS: PlanKind[] = ['promotion', 'event', 'special', 'content', 'holiday', 'reminder']
const pad = (n: number) => String(n).padStart(2, '0')
const localYmd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

function toKind(v: unknown): string {
  return VALID_KINDS.includes(v as PlanKind) ? (v as string) : 'event'
}
function trimTime(v: unknown): string | null {
  return typeof v === 'string' && v ? v.slice(0, 5) : null
}

type Admin = ReturnType<typeof createAdminClient>

async function loadProfiles(admin: Admin, ids: string[]): Promise<Record<string, { name: string; avatar: string | null }>> {
  const out: Record<string, { name: string; avatar: string | null }> = {}
  const unique = [...new Set(ids)].filter(Boolean)
  if (!unique.length) return out
  const { data } = await admin.from('profiles').select('id, full_name, email, avatar_url').in('id', unique)
  for (const p of data ?? []) {
    out[p.id as string] = {
      name: ((p.full_name as string) || (p.email as string) || 'Someone').trim(),
      avatar: (p.avatar_url as string | null) ?? null,
    }
  }
  return out
}

export interface AssignablePerson {
  id: string
  name: string
  role: string | null
  avatarUrl: string | null
}

/**
 * People a plan for this client can be shared with: the restaurant's own
 * owner and team, the assigned Apnosh staff (strategist, editor...), and
 * vendors already booked for the client's shoots. Powers the participant
 * picker.
 */
export async function getAssignablePeople(clientId: string): Promise<AssignablePerson[]> {
  if (!clientId) return []
  try {
    const admin = createAdminClient()
    const [raRes, bizRes, cuRes, shootsRes] = await Promise.all([
      admin.from('role_assignments').select('person_id, role').eq('client_id', clientId).is('ended_at', null),
      admin.from('businesses').select('owner_id').eq('client_id', clientId),
      admin.from('client_users').select('auth_user_id').eq('client_id', clientId),
      admin.from('shoots').select('id').eq('client_id', clientId),
    ])
    const roleByPerson = new Map<string, string>()
    for (const r of raRes.data ?? []) if (r.person_id) roleByPerson.set(r.person_id as string, (r.role as string) ?? 'team')
    for (const b of bizRes.data ?? []) {
      const id = b.owner_id as string | null
      if (id && !roleByPerson.has(id)) roleByPerson.set(id, 'owner')
    }
    for (const c of cuRes.data ?? []) {
      const id = c.auth_user_id as string | null
      if (id && !roleByPerson.has(id)) roleByPerson.set(id, 'team')
    }
    const shootIds = (shootsRes.data ?? []).map(s => s.id as string)
    if (shootIds.length) {
      const { data: crew } = await admin.from('shoot_crew').select('person_id, role').in('shoot_id', shootIds).is('declined_at', null)
      for (const c of crew ?? []) {
        const id = c.person_id as string | null
        if (id && !roleByPerson.has(id)) roleByPerson.set(id, (c.role as string) ?? 'vendor')
      }
    }
    const ids = [...roleByPerson.keys()]
    if (!ids.length) return []
    const profiles = await loadProfiles(admin, ids)
    return ids
      .map(id => ({ id, name: profiles[id]?.name ?? 'Someone', role: roleByPerson.get(id) ?? null, avatarUrl: profiles[id]?.avatar ?? null }))
      .sort((a, b) => a.name.localeCompare(b.name))
  } catch (e) {
    console.error('[get-assignable-people]', e)
    return []
  }
}

export async function getPlanFeed(viewerId: string, opts?: { clientId?: string }): Promise<PlanFeed> {
  const empty: PlanFeed = { items: [], clients: [], hasStrategist: false, approvals: 0, viewerId }
  if (!viewerId) return empty

  try {
    const admin = createAdminClient()

    /* 1. Memberships: where does this viewer have a stake. */
    const [bizRes, cuRes, raRes, ppRes, scRes] = await Promise.all([
      admin.from('businesses').select('client_id').eq('owner_id', viewerId),
      admin.from('client_users').select('client_id').eq('auth_user_id', viewerId),
      admin.from('role_assignments').select('client_id').eq('person_id', viewerId).is('ended_at', null).not('client_id', 'is', null),
      admin.from('plan_participants').select('plan_id').eq('person_id', viewerId).neq('status', 'declined'),
      admin.from('shoot_crew').select('shoot_id').eq('person_id', viewerId).is('declined_at', null),
    ])

    const ownerTeam = new Set<string>([
      ...(bizRes.data ?? []).map(r => r.client_id as string),
      ...(cuRes.data ?? []).map(r => r.client_id as string),
    ].filter(Boolean))
    const agency = new Set<string>((raRes.data ?? []).map(r => r.client_id as string).filter(Boolean))
    const stake = new Set<string>([...ownerTeam, ...agency])
    const partPlanIds = (ppRes.data ?? []).map(r => r.plan_id as string)
    const crewShootIds = (scRes.data ?? []).map(r => r.shoot_id as string)

    /* 2. owner_plans visible to the viewer. */
    const planRows: Record<string, unknown>[] = []
    const pushPlans = (rows: Record<string, unknown>[] | null) => { if (rows) planRows.push(...rows) }
    if (stake.size) pushPlans((await admin.from('owner_plans').select('*').is('deleted_at', null).in('client_id', [...stake])).data)
    pushPlans((await admin.from('owner_plans').select('*').is('deleted_at', null).eq('created_by', viewerId)).data)
    if (partPlanIds.length) pushPlans((await admin.from('owner_plans').select('*').is('deleted_at', null).in('id', partPlanIds)).data)

    const planMap = new Map<string, Record<string, unknown>>()
    for (const p of planRows) {
      const id = p.id as string
      if (planMap.has(id)) continue
      const isCreator = p.created_by === viewerId
      const isParticipant = partPlanIds.includes(id)
      const visibleTeam = p.visibility === 'team' && stake.has(p.client_id as string)
      if (isCreator || isParticipant || visibleTeam) planMap.set(id, p)
    }

    /* 3. shoots visible to the viewer (cross-account). */
    const shootRows: Record<string, unknown>[] = []
    const pushShoots = (rows: Record<string, unknown>[] | null) => { if (rows) shootRows.push(...rows) }
    if (stake.size) pushShoots((await admin.from('shoots').select('*').in('client_id', [...stake])).data)
    pushShoots((await admin.from('shoots').select('*').eq('lead_person_id', viewerId)).data)
    if (crewShootIds.length) pushShoots((await admin.from('shoots').select('*').in('id', crewShootIds)).data)
    const shootMap = new Map<string, Record<string, unknown>>()
    for (const s of shootRows) if (!shootMap.has(s.id as string)) shootMap.set(s.id as string, s)

    /* 4. Participants + crew, with profile names. */
    const planIds = [...planMap.keys()]
    const shootIds = [...shootMap.keys()]
    const partsByPlan = new Map<string, PlanPerson[]>()
    const crewByShoot = new Map<string, PlanPerson[]>()

    const [partsRes, crewRes] = await Promise.all([
      planIds.length ? admin.from('plan_participants').select('plan_id, person_id, role').in('plan_id', planIds).neq('status', 'declined') : Promise.resolve({ data: [] as Record<string, unknown>[] }),
      shootIds.length ? admin.from('shoot_crew').select('shoot_id, person_id, role, is_lead').in('shoot_id', shootIds).is('declined_at', null) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    ])
    const profileIds = [
      ...(partsRes.data ?? []).map(r => r.person_id as string),
      ...(crewRes.data ?? []).map(r => r.person_id as string),
    ]
    const profiles = await loadProfiles(admin, profileIds)
    for (const r of partsRes.data ?? []) {
      const arr = partsByPlan.get(r.plan_id as string) ?? []
      const pr = profiles[r.person_id as string]
      arr.push({ id: r.person_id as string, name: pr?.name ?? 'Someone', role: (r.role as string) ?? null, avatarUrl: pr?.avatar ?? null })
      partsByPlan.set(r.plan_id as string, arr)
    }
    for (const r of crewRes.data ?? []) {
      const arr = crewByShoot.get(r.shoot_id as string) ?? []
      const pr = profiles[r.person_id as string]
      arr.push({ id: r.person_id as string, name: pr?.name ?? 'Crew', role: (r.role as string) ?? null, avatarUrl: pr?.avatar ?? null })
      crewByShoot.set(r.shoot_id as string, arr)
    }

    /* 5. Client names for everything in view. */
    const allClientIds = new Set<string>([...stake])
    for (const p of planMap.values()) allClientIds.add(p.client_id as string)
    for (const s of shootMap.values()) allClientIds.add(s.client_id as string)
    const nameById: Record<string, string | null> = {}
    if (allClientIds.size) {
      const { data } = await admin.from('clients').select('id, name').in('id', [...allClientIds])
      for (const c of data ?? []) nameById[c.id as string] = (c.name as string | null) ?? null
    }

    /* 6. Agency content (read-only) for clients the viewer owns or is
          assigned to. Exclude old shoot_plans 'shoot' kind so we don't
          double up with the new shoots table. */
    const fromIso = new Date(Date.now() - 31 * 86_400_000).toISOString()
    const toIso = new Date(Date.now() + 183 * 86_400_000).toISOString()
    const agencyClientIds = (opts?.clientId ? [opts.clientId].filter(c => stake.has(c)) : [...stake])
    const calResults = await Promise.all(
      agencyClientIds.map(cid => getCalendar(cid, { fromIso, toIso }).then(evs => ({ cid, evs })).catch(() => ({ cid, evs: [] as CalendarEvent[] }))),
    )

    /* 7. Normalize. */
    const items: PlanFeedItem[] = []

    for (const p of planMap.values()) {
      const cid = p.client_id as string
      const editable = p.created_by === viewerId || ownerTeam.has(cid) || agency.has(cid)
      items.push({
        id: p.id as string,
        source: 'owner',
        clientId: cid,
        clientName: nameById[cid] ?? null,
        title: (p.title as string) ?? '',
        detail: (p.notes as string | null) ?? null,
        kind: toKind(p.kind),
        startDate: (p.start_date as string).slice(0, 10),
        endDate: p.end_date ? (p.end_date as string).slice(0, 10) : null,
        allDay: p.all_day !== false,
        startTime: p.all_day === false ? trimTime(p.start_time) : null,
        status: (p.status as string) ?? 'planned',
        editable,
        visibility: (p.visibility as 'private' | 'team') ?? 'team',
        participants: partsByPlan.get(p.id as string) ?? [],
        href: null,
      })
    }

    for (const s of shootMap.values()) {
      const cid = s.client_id as string
      const when = new Date(s.scheduled_at as string)
      const valid = !isNaN(when.getTime())
      items.push({
        id: `shoot-${s.id as string}`,
        source: 'shoot',
        clientId: cid,
        clientName: nameById[cid] ?? null,
        title: (s.title as string) || 'Shoot',
        detail: (s.location_name as string | null) ?? null,
        kind: 'shoot',
        startDate: valid ? localYmd(when) : (s.scheduled_at as string).slice(0, 10),
        endDate: null,
        allDay: false,
        startTime: valid ? `${pad(when.getHours())}:${pad(when.getMinutes())}` : null,
        status: (s.status as string) ?? 'planned',
        editable: false,
        participants: crewByShoot.get(s.id as string) ?? [],
        href: '/dashboard/calendar',
      })
    }

    for (const { cid, evs } of calResults) {
      for (const e of evs) {
        if (e.kind === 'shoot') continue
        const d = new Date(e.startIso)
        const valid = !isNaN(d.getTime())
        items.push({
          id: `agency-${e.id}`,
          source: 'agency',
          clientId: cid,
          clientName: nameById[cid] ?? null,
          title: e.title,
          detail: e.detail ?? null,
          kind: e.kind,
          startDate: valid ? localYmd(d) : e.startIso.slice(0, 10),
          endDate: null,
          allDay: e.allDay,
          startTime: e.allDay || !valid ? null : `${pad(d.getHours())}:${pad(d.getMinutes())}`,
          status: e.status,
          editable: false,
          participants: [],
          href: e.href ?? null,
        })
      }
    }

    /* 8. Scope filter + sort. */
    let scoped = items
    if (opts?.clientId) scoped = items.filter(i => i.clientId === opts.clientId)
    scoped.sort((a, b) => a.startDate.localeCompare(b.startDate) || (a.startTime ?? '').localeCompare(b.startTime ?? ''))

    /* 9. Strategist presence (self-serve fallback). */
    const scopedClients = opts?.clientId ? [opts.clientId] : [...stake]
    let hasStrategist = false
    if (scopedClients.length) {
      const { data } = await admin
        .from('role_assignments')
        .select('client_id')
        .in('client_id', scopedClients)
        .eq('role', 'strategist')
        .is('ended_at', null)
        .limit(1)
      hasStrategist = (data ?? []).length > 0
    }

    /* 10. Items waiting on the owner's approval (only for restaurants the
          viewer actually owns / is on the team of). */
    const approvalClients = (opts?.clientId ? [opts.clientId] : [...ownerTeam]).filter(c => ownerTeam.has(c))
    let approvals = 0
    if (approvalClients.length) {
      const [delv, drafts] = await Promise.all([
        admin.from('deliverables').select('id', { count: 'exact', head: true })
          .in('business_id', approvalClients).eq('status', 'client_review'),
        admin.from('content_drafts').select('id', { count: 'exact', head: true })
          .in('client_id', approvalClients).eq('proposed_via', 'client_request')
          .eq('status', 'approved').is('client_signed_off_at', null),
      ])
      approvals = (delv.count ?? 0) + (drafts.count ?? 0)
    }

    /* 11. Client switcher list (restaurants the viewer has a stake in). */
    const clients = [...stake]
      .map(id => ({ id, name: nameById[id] ?? null }))
      .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))

    return { items: scoped, clients, hasStrategist, approvals, viewerId }
  } catch (e) {
    console.error('[get-plan-feed]', e)
    return empty
  }
}
