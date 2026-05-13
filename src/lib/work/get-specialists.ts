'use server'

/**
 * Cross-client specialist directory for /work/specialists.
 *
 * Lists every profile that holds at least one specialist-relevant
 * capability (anything except client_owner / client_manager), with
 * their current bio / specialties / availability and a count of how
 * many clients they're actively assigned to.
 *
 * This is the staff-facing source of truth that the client-facing
 * Marketplace tab pulls from indirectly (via getAvailableSpecialists).
 * Editing here ripples directly into what clients see.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { ROLE_LABEL } from '@/lib/dashboard/team-labels'

const SPECIALIST_CAPABILITIES = new Set([
  'strategist',
  'social_media_manager',
  'copywriter',
  'photographer',
  'videographer',
  'editor',
  'designer',
  'community_mgr',
  'ad_buyer',
  'seo_specialist',
  'influencer',
  'onboarder',
  'paid_media',
])

export interface SpecialistRow {
  personId: string
  email: string
  displayName: string
  avatarUrl: string | null
  bio: string | null
  portfolioUrl: string | null
  specialties: string[]
  availability: 'available' | 'limited' | 'full'
  capabilities: string[]
  capabilityLabels: string[]
  /** Number of active (non-ended) client assignments. Cross-client signal. */
  activeAssignments: number
  /** Client names for the cards' "Currently assigned to" line. */
  assignedClientNames: string[]
  lastSeenAt: string | null
}

export async function getAllSpecialists(): Promise<SpecialistRow[]> {
  const admin = createAdminClient()

  /* Pull every active capability row that's specialist-flavored.
     This is the gate — only people who hold one of these capabilities
     show up on the directory, even if they have a profile. */
  const { data: capsData } = await admin
    .from('person_capabilities')
    .select('person_id, capability')
    .eq('status', 'active')
    .in('capability', [...SPECIALIST_CAPABILITIES])

  const capsByPerson = new Map<string, string[]>()
  for (const c of capsData ?? []) {
    const arr = capsByPerson.get(c.person_id as string) ?? []
    if (!arr.includes(c.capability as string)) arr.push(c.capability as string)
    capsByPerson.set(c.person_id as string, arr)
  }
  const personIds = [...capsByPerson.keys()]
  if (personIds.length === 0) return []

  const [profilesRes, assignmentsRes] = await Promise.all([
    admin
      .from('profiles')
      .select('id, email, full_name, avatar_url, bio, portfolio_url, specialties, availability_status, last_seen_at')
      .in('id', personIds),
    admin
      .from('role_assignments')
      .select('person_id, client_id, clients(name)')
      .in('person_id', personIds)
      .is('ended_at', null)
      .not('client_id', 'is', null),
  ])

  /* Group assignments to count active client coverage per specialist
     and surface the client names inline. */
  const assignmentsByPerson = new Map<string, Set<string>>()
  const clientNamesByPerson = new Map<string, Set<string>>()
  for (const a of assignmentsRes.data ?? []) {
    const pid = a.person_id as string
    if (!assignmentsByPerson.has(pid)) assignmentsByPerson.set(pid, new Set())
    assignmentsByPerson.get(pid)!.add(a.client_id as string)
    /* Supabase joins return the related row under the relation key.
       In some shapes it's an array even with .single relationship,
       so we treat it defensively. */
    const c = a.clients as { name?: string } | { name?: string }[] | null
    const name = Array.isArray(c) ? c[0]?.name : c?.name
    if (name) {
      if (!clientNamesByPerson.has(pid)) clientNamesByPerson.set(pid, new Set())
      clientNamesByPerson.get(pid)!.add(name)
    }
  }

  const rows: SpecialistRow[] = []
  for (const p of profilesRes.data ?? []) {
    const pid = p.id as string
    const caps = capsByPerson.get(pid) ?? []
    const assignedClients = clientNamesByPerson.get(pid)
    rows.push({
      personId: pid,
      email: (p.email as string) ?? '',
      displayName: (p.full_name as string) || (p.email as string) || 'Specialist',
      avatarUrl: (p.avatar_url as string) ?? null,
      bio: (p.bio as string) ?? null,
      portfolioUrl: (p.portfolio_url as string) ?? null,
      specialties: Array.isArray(p.specialties) ? (p.specialties as string[]) : [],
      availability: ((p.availability_status as string) ?? 'available') as SpecialistRow['availability'],
      capabilities: caps,
      capabilityLabels: caps.map(c => ROLE_LABEL[c] ?? c),
      activeAssignments: assignmentsByPerson.get(pid)?.size ?? 0,
      assignedClientNames: assignedClients ? [...assignedClients] : [],
      lastSeenAt: (p.last_seen_at as string) ?? null,
    })
  }

  rows.sort((a, b) => {
    /* Available before limited before full; then more assignments
       before fewer; then alphabetical. */
    const availRank = { available: 0, limited: 1, full: 2 }
    const ar = availRank[a.availability] - availRank[b.availability]
    if (ar !== 0) return ar
    if (a.activeAssignments !== b.activeAssignments) return b.activeAssignments - a.activeAssignments
    return a.displayName.localeCompare(b.displayName)
  })

  return rows
}
