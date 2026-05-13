'use server'

/**
 * Team-page data layer for /dashboard/social/team.
 *
 * Reads from existing tables (profiles, role_assignments) joined with
 * the new specialist_activity feed. Returns one ordered list of team
 * members shaped for direct rendering — no per-card client fetches
 * needed.
 *
 * Sort order is rule-based, not user-customizable (per spec):
 *   1. Primary contact (always first; treated as the lead strategist)
 *   2. Social media manager
 *   3. Copywriter
 *   4. Photographer / Videographer
 *   5. Editor (video_editor) / Community manager
 *   6. Ad buyer (paid media) / SEO specialist
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { ROLE_LABEL } from './team-labels'

/** Sort weight for team-list ordering. Lower = earlier. */
const ROLE_ORDER: Record<string, number> = {
  strategist: 0,
  social_media_manager: 10,
  copywriter: 20,
  photographer: 30,
  videographer: 31,
  editor: 40,
  community_mgr: 41,
  ad_buyer: 50,
  seo_specialist: 51,
  influencer: 60,
  admin: 99,
}

const ACTIVITY_LABEL: Record<string, string> = {
  published_post: 'Published your post',
  delivered_reel: 'Delivered your reel',
  shot_photoshoot: 'Shot your photos',
  wrote_caption: 'Wrote your caption',
  replied_to_dm: 'Replied to a DM',
  launched_boost: 'Launched a boost',
  replied_to_review: 'Replied to a review',
  edited_video: 'Edited a video',
  published_web_update: 'Updated your site',
}

export interface TeamMember {
  /** auth.user.id */
  personId: string
  displayName: string
  email: string
  avatarUrl: string | null
  bio: string | null
  portfolioUrl: string | null
  specialties: string[]
  availability: 'available' | 'limited' | 'full'
  /** All capability codes this person holds on THIS client. */
  roles: string[]
  /** Human-readable label list — order matches `roles`. */
  roleLabels: string[]
  isPrimaryContact: boolean
  currentFocus: string | null
  /** True if last_seen_at within the last 30 minutes. */
  workingNow: boolean
  /** ISO of most recent activity row for this (client, specialist). */
  lastActivityAt: string | null
  /** Human "Did X · 2 days ago" line. Null if no activity yet. */
  lastActivityLabel: string | null
  /** Sort weight from the row's primary role. */
  sortKey: number
  /** Open swap_request status, if any. UI shows a pill. */
  swapStatus: 'open' | 'in_discussion' | null
}

const WORKING_NOW_WINDOW_MS = 30 * 60 * 1000

interface AssignmentRow {
  person_id: string
  role: string
  is_primary_contact: boolean
  current_focus: string | null
  client_id: string
}

export async function getTeamForClient(clientId: string): Promise<TeamMember[]> {
  const admin = createAdminClient()

  // 1. Active AGENCY-SIDE assignments for this client. Explicitly
  //    filter out client_owner / client_manager — those are the
  //    restaurant's own staff, not the Apnosh team. A restaurant
  //    owner viewing /dashboard/social/team shouldn't see themselves.
  const { data: assignments } = await admin
    .from('role_assignments')
    .select('person_id, role, is_primary_contact, current_focus, client_id')
    .eq('client_id', clientId)
    .is('ended_at', null)
    .neq('scope', 'global')  // pool-only rows don't belong here
    .not('role', 'in', '(client_owner,client_manager)')

  if (!assignments?.length) return []

  // 2. Group roles per person. A person may hold multiple capabilities
  //    on the same account (e.g. strategist + social_media_manager).
  const byPerson = new Map<string, AssignmentRow[]>()
  for (const a of assignments as AssignmentRow[]) {
    const arr = byPerson.get(a.person_id) ?? []
    arr.push(a)
    byPerson.set(a.person_id, arr)
  }
  const personIds = [...byPerson.keys()]

  // 3. Fetch profile + activity + open-swap status in parallel.
  const [profilesRes, activitiesRes, swapsRes] = await Promise.all([
    admin
      .from('profiles')
      .select('id, email, full_name, avatar_url, bio, portfolio_url, specialties, availability_status, last_seen_at')
      .in('id', personIds),
    admin
      .from('specialist_activity')
      .select('specialist_id, activity_type, occurred_at')
      .eq('client_id', clientId)
      .in('specialist_id', personIds)
      .order('occurred_at', { ascending: false })
      .limit(200),
    admin
      .from('swap_requests')
      .select('current_specialist_id, current_role, status')
      .eq('client_id', clientId)
      .in('status', ['open', 'in_discussion'])
      .in('current_specialist_id', personIds),
  ])

  const profileMap = new Map(
    (profilesRes.data ?? []).map(p => [p.id as string, p]),
  )

  // Most recent activity per person (server already ordered desc).
  const lastActivity = new Map<string, { type: string; at: string }>()
  for (const a of activitiesRes.data ?? []) {
    if (lastActivity.has(a.specialist_id as string)) continue
    lastActivity.set(a.specialist_id as string, {
      type: a.activity_type as string,
      at: a.occurred_at as string,
    })
  }

  const swapsByPerson = new Map<string, 'open' | 'in_discussion'>()
  for (const s of swapsRes.data ?? []) {
    const existing = swapsByPerson.get(s.current_specialist_id as string)
    // 'in_discussion' wins over 'open' if both exist for the same person.
    if (existing === 'in_discussion') continue
    swapsByPerson.set(s.current_specialist_id as string, s.status as 'open' | 'in_discussion')
  }

  const now = Date.now()
  const members: TeamMember[] = []

  for (const personId of personIds) {
    const profile = profileMap.get(personId)
    if (!profile) continue  // missing profile row — skip silently

    const rows = byPerson.get(personId) ?? []
    // Sort this person's roles by ROLE_ORDER so the primary one drives the sort key.
    rows.sort((a, b) => (ROLE_ORDER[a.role] ?? 90) - (ROLE_ORDER[b.role] ?? 90))
    const roles = rows.map(r => r.role)
    const roleLabels = roles.map(r => ROLE_LABEL[r] ?? r)
    const primary = rows.find(r => r.is_primary_contact)
    const focus = (primary?.current_focus ?? rows[0]?.current_focus) ?? null

    const last = lastActivity.get(personId)
    const lastLabel = last
      ? `${ACTIVITY_LABEL[last.type] ?? 'Worked on your account'} · ${relativeTime(last.at)}`
      : null

    const lastSeen = (profile.last_seen_at as string | null) ?? null
    const workingNow = !!lastSeen && now - new Date(lastSeen).getTime() < WORKING_NOW_WINDOW_MS

    members.push({
      personId,
      displayName: (profile.full_name as string) || (profile.email as string) || 'Team member',
      email: (profile.email as string) ?? '',
      avatarUrl: (profile.avatar_url as string) ?? null,
      bio: (profile.bio as string) ?? null,
      portfolioUrl: (profile.portfolio_url as string) ?? null,
      specialties: Array.isArray(profile.specialties) ? (profile.specialties as string[]) : [],
      availability: ((profile.availability_status as string) ?? 'available') as TeamMember['availability'],
      roles,
      roleLabels,
      isPrimaryContact: !!primary,
      currentFocus: focus,
      workingNow,
      lastActivityAt: last?.at ?? null,
      lastActivityLabel: lastLabel,
      sortKey: ROLE_ORDER[rows[0]?.role] ?? 90,
      swapStatus: swapsByPerson.get(personId) ?? null,
    })
  }

  // Primary contact always first regardless of role.
  members.sort((a, b) => {
    if (a.isPrimaryContact !== b.isPrimaryContact) return a.isPrimaryContact ? -1 : 1
    if (a.sortKey !== b.sortKey) return a.sortKey - b.sortKey
    return a.displayName.localeCompare(b.displayName)
  })

  return members
}

/** Tiny relative-time helper. Same shape used by the notification bell. */
function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diffMs / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d === 1) return 'yesterday'
  if (d < 7) return `${d} days ago`
  const w = Math.floor(d / 7)
  if (w < 5) return `${w} ${w === 1 ? 'week' : 'weeks'} ago`
  const mo = Math.floor(d / 30)
  return `${mo} ${mo === 1 ? 'month' : 'months'} ago`
}
