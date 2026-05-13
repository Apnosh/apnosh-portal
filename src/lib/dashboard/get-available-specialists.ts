'use server'

/**
 * Marketplace data for the Add-to-your-team tab of /dashboard/team.
 *
 * Returns a list of specialists this client COULD add to their team —
 * meaning: people with at least one active relevant capability who
 * are NOT already assigned to this client. Augments each row with a
 * one-line trust signal computed from cross-client activity.
 *
 * Filters supported (all multi-select / boolean):
 *   - roles:        only return people with at least one of these capabilities
 *   - availability: filter availability_status (defaults to ['available','limited'])
 *
 * Sort: available > limited > full, then by other-client-count desc,
 * then alphabetical. Caller can ignore the order; the UI surfaces
 * cards equally weighted within the grid.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { ROLE_LABEL } from './team-labels'

export interface AvailableSpecialist {
  personId: string
  displayName: string
  avatarUrl: string | null
  bio: string | null
  portfolioUrl: string | null
  specialties: string[]
  availability: 'available' | 'limited' | 'full'
  /** All capability codes — what they CAN do, system-wide. */
  capabilities: string[]
  capabilityLabels: string[]
  /** How many OTHER active client assignments this person has — drives the trust line. */
  otherActiveAccounts: number
  /** Optional trust signal text, e.g. "Works with 4 restaurants in Seattle". */
  trustSignal: string
  /** Whether the marketplace bench tag is set. Used to subtly de-emphasize, not shown as a label. */
  isMarketplace: boolean
}

interface FilterOpts {
  roles?: string[]
  availability?: ('available' | 'limited' | 'full')[]
  search?: string
}

/* Backend roles aren't surfaced as "missing" suggestions — only the
   roles a restaurant owner would consciously notice when they're not
   on the team. */
const SUGGESTABLE_ROLES = new Set([
  'strategist',
  'social_media_manager',
  'copywriter',
  'photographer',
  'videographer',
])

/* Capabilities we treat as a "specialist" you'd add via marketplace.
   Client and admin roles are filtered out. */
const MARKETPLACE_CAPABILITIES = new Set([
  'strategist',
  'social_media_manager',
  'copywriter',
  'photographer',
  'videographer',
  'editor',
  'community_mgr',
  'ad_buyer',
  'seo_specialist',
  'influencer',
])

export async function getAvailableSpecialists(
  clientId: string,
  filters: FilterOpts = {},
): Promise<AvailableSpecialist[]> {
  const admin = createAdminClient()

  // 1. Find everyone already on this client's team. They get excluded.
  const { data: assigned } = await admin
    .from('role_assignments')
    .select('person_id')
    .eq('client_id', clientId)
    .is('ended_at', null)
  const onTeam = new Set((assigned ?? []).map(r => r.person_id as string))

  // 2. Active capabilities, filtered to marketplace-relevant roles.
  let capQuery = admin
    .from('person_capabilities')
    .select('person_id, capability')
    .eq('status', 'active')
    .in('capability', [...MARKETPLACE_CAPABILITIES])
  if (filters.roles?.length) {
    capQuery = capQuery.in('capability', filters.roles)
  }
  const { data: caps } = await capQuery

  // Group capabilities by person.
  const byPerson = new Map<string, string[]>()
  for (const c of caps ?? []) {
    if (onTeam.has(c.person_id as string)) continue
    const arr = byPerson.get(c.person_id as string) ?? []
    if (!arr.includes(c.capability as string)) arr.push(c.capability as string)
    byPerson.set(c.person_id as string, arr)
  }
  const candidateIds = [...byPerson.keys()]
  if (candidateIds.length === 0) return []

  // 3. Profile + cross-client activity counts in parallel.
  const [profilesRes, assignmentsCountRes] = await Promise.all([
    admin
      .from('profiles')
      .select('id, full_name, avatar_url, bio, portfolio_url, specialties, availability_status, role')
      .in('id', candidateIds),
    /* How many distinct active clients does each candidate currently
       serve? Cheap signal for "they're working" — drives trust line. */
    admin
      .from('role_assignments')
      .select('person_id, client_id')
      .in('person_id', candidateIds)
      .is('ended_at', null)
      .not('client_id', 'is', null),
  ])

  const otherAccounts = new Map<string, number>()
  for (const r of assignmentsCountRes.data ?? []) {
    if ((r.client_id as string) === clientId) continue
    otherAccounts.set(r.person_id as string, (otherAccounts.get(r.person_id as string) ?? 0) + 1)
  }

  const allowedAvailability = new Set(
    filters.availability && filters.availability.length > 0
      ? filters.availability
      : ['available', 'limited'],
  )

  const out: AvailableSpecialist[] = []
  for (const p of profilesRes.data ?? []) {
    const personId = p.id as string
    /* Skip people whose profile role is set to 'client' — they shouldn't
       appear as marketplace candidates regardless of stray capabilities. */
    if ((p.role as string) === 'client') continue

    const availability = ((p.availability_status as string) ?? 'available') as AvailableSpecialist['availability']
    if (!allowedAvailability.has(availability)) continue

    const capabilities = byPerson.get(personId) ?? []
    const capabilityLabels = capabilities.map(c => ROLE_LABEL[c] ?? c)
    const count = otherAccounts.get(personId) ?? 0
    const displayName = (p.full_name as string) || 'Specialist'
    const specialties = Array.isArray(p.specialties) ? (p.specialties as string[]) : []

    // Optional search filter: matches name OR any specialty OR any role label.
    if (filters.search?.trim()) {
      const q = filters.search.trim().toLowerCase()
      const haystack = [displayName, ...specialties, ...capabilityLabels].join(' ').toLowerCase()
      if (!haystack.includes(q)) continue
    }

    out.push({
      personId,
      displayName,
      avatarUrl: (p.avatar_url as string) ?? null,
      bio: (p.bio as string) ?? null,
      portfolioUrl: (p.portfolio_url as string) ?? null,
      specialties,
      availability,
      capabilities,
      capabilityLabels,
      otherActiveAccounts: count,
      trustSignal: buildTrustSignal(count, capabilityLabels[0] ?? null),
      isMarketplace: false,  // reserved for future when we tag marketplace bench
    })
  }

  out.sort((a, b) => {
    const availRank = { available: 0, limited: 1, full: 2 }
    const ar = availRank[a.availability] - availRank[b.availability]
    if (ar !== 0) return ar
    if (a.otherActiveAccounts !== b.otherActiveAccounts) return b.otherActiveAccounts - a.otherActiveAccounts
    return a.displayName.localeCompare(b.displayName)
  })

  return out
}

/**
 * Which sensible roles are NOT on the team yet — drives the
 * "You don't have a dedicated X" suggestion strip above the grid.
 * Only "client-noticeable" roles surface (strategist / SMM / copywriter /
 * photographer / videographer).
 */
export async function getMissingTeamRoles(clientId: string): Promise<string[]> {
  const admin = createAdminClient()
  const { data: assigned } = await admin
    .from('role_assignments')
    .select('role')
    .eq('client_id', clientId)
    .is('ended_at', null)
  const haveRoles = new Set((assigned ?? []).map(r => r.role as string))
  return [...SUGGESTABLE_ROLES].filter(r => !haveRoles.has(r))
}

function buildTrustSignal(otherAccounts: number, primaryRoleLabel: string | null): string {
  if (otherAccounts === 0) {
    return primaryRoleLabel ? `New on Apnosh · ${primaryRoleLabel}` : 'New on Apnosh'
  }
  if (otherAccounts === 1) {
    return primaryRoleLabel
      ? `Works with 1 other Apnosh client · ${primaryRoleLabel}`
      : 'Works with 1 other Apnosh client'
  }
  const noun = primaryRoleLabel ? ` · ${primaryRoleLabel}` : ''
  return `Works with ${otherAccounts} other Apnosh clients${noun}`
}
