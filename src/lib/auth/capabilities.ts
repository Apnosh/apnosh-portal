/**
 * Capabilities helper — server-side reads of the multi-role tables
 * from migration 101.
 *
 * Designed to degrade gracefully: if the new tables aren't present
 * (eg. dev DB hasn't run 101 yet), every helper returns a sensible
 * legacy answer derived from profiles.role + businesses + client_users.
 * That means the workspace switcher and any Phase-0 surface keep
 * working before the migration is applied in prod.
 */

import { cache } from 'react'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'

export type RoleCapability =
  // Core 11 (migration 101)
  | 'admin'
  | 'strategist'
  | 'ad_buyer'
  | 'community_mgr'
  | 'editor'
  | 'copywriter'
  | 'videographer'
  | 'photographer'
  | 'influencer'
  | 'client_owner'
  | 'client_manager'
  // Added in migration 106
  | 'designer'
  | 'email_specialist'
  | 'local_seo'
  | 'web_ops'
  | 'web_designer'
  | 'web_developer'
  | 'data_analyst'
  | 'onboarder'
  | 'finance'
  | 'paid_media'
  | 'visual_creator'

export interface RoleSummary {
  role: RoleCapability
  /** Marketing-friendly display name. */
  label: string
  /** Accent color slug used in the workspace switcher chip. */
  accent: 'emerald' | 'violet' | 'amber' | 'rose' | 'indigo' | 'sky' | 'teal' | 'pink' | 'ink' | 'brand'
  /** Where this role lands when activated. */
  landingPath: string
}

const META: Record<RoleCapability, Omit<RoleSummary, 'role'>> = {
  // Core 11
  admin:          { label: 'Admin',         accent: 'ink',     landingPath: '/admin' },
  strategist:     { label: 'Strategist',    accent: 'emerald', landingPath: '/work/today' },
  ad_buyer:       { label: 'Ad buyer',      accent: 'violet',  landingPath: '/work/boosts' },
  community_mgr:  { label: 'Community',     accent: 'teal',    landingPath: '/work/engage' },
  editor:         { label: 'Editor',        accent: 'indigo',  landingPath: '/work/edits' },
  copywriter:     { label: 'Copywriter',    accent: 'sky',     landingPath: '/work/briefs' },
  videographer:   { label: 'Videographer',  accent: 'amber',   landingPath: '/work/shoots' },
  photographer:   { label: 'Photographer',  accent: 'rose',    landingPath: '/work/shoots' },
  influencer:     { label: 'Creator',       accent: 'pink',    landingPath: '/marketplace' },
  client_owner:   { label: 'Owner',         accent: 'brand',   landingPath: '/dashboard' },
  client_manager: { label: 'Manager',       accent: 'brand',   landingPath: '/dashboard' },
  // Added in migration 106 (catalog is also in src/lib/roles/catalog.ts)
  designer:         { label: 'Designer',         accent: 'pink',    landingPath: '/work/queue' },
  email_specialist: { label: 'Email Specialist', accent: 'teal',    landingPath: '/work/email' },
  local_seo:        { label: 'Local SEO',        accent: 'emerald', landingPath: '/work/local' },
  web_ops:          { label: 'Web Ops',          accent: 'sky',     landingPath: '/work/web' },
  web_designer:     { label: 'Web Designer',     accent: 'rose',    landingPath: '/work/web-projects' },
  web_developer:    { label: 'Web Developer',    accent: 'indigo',  landingPath: '/work/web-projects' },
  data_analyst:     { label: 'Data Analyst',     accent: 'sky',     landingPath: '/work/reports' },
  onboarder:        { label: 'Onboarder',        accent: 'amber',   landingPath: '/work/onboarding' },
  finance:          { label: 'Finance',          accent: 'ink',     landingPath: '/admin/billing' },
  paid_media:       { label: 'Paid Media',       accent: 'violet',  landingPath: '/work/boosts' },
  visual_creator:   { label: 'Visual Creator',   accent: 'amber',   landingPath: '/work/shoots' },
}

export function describeRole(role: RoleCapability): RoleSummary {
  return { role, ...META[role] }
}

/**
 * All active capabilities the current user has. Returns [] if not signed
 * in. Falls back to legacy detection if person_capabilities is empty.
 */
export const getMyCapabilities = cache(
  async (): Promise<RoleSummary[]> => {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    // Try new table first.
    const { data, error } = await supabase
      .from('person_capabilities')
      .select('capability')
      .eq('person_id', user.id)
      .eq('status', 'active')

    if (!error && data && data.length > 0) {
      const seen = new Set<RoleCapability>()
      const out: RoleSummary[] = []
      for (const row of data) {
        const cap = row.capability as RoleCapability
        if (META[cap] && !seen.has(cap)) {
          seen.add(cap)
          out.push(describeRole(cap))
        }
      }
      return out
    }

    // Legacy fallback: derive a single capability from existing tables.
    const { isAdmin, clientId } = await resolveCurrentClient()
    if (isAdmin) return [describeRole('admin')]
    if (clientId) return [describeRole('client_owner')]
    return []
  },
)

/**
 * The role the user is "viewing as" right now. Honors the ?role= URL
 * param if it's a role they actually hold; otherwise picks the first
 * capability in a stable priority order.
 */
export async function getActiveRole(roleParam: string | null = null): Promise<RoleSummary | null> {
  const caps = await getMyCapabilities()
  if (caps.length === 0) return null

  if (roleParam) {
    const match = caps.find(c => c.role === roleParam)
    if (match) return match
  }

  // Priority: admin > strategist > internal > field > client > influencer.
  const order: RoleCapability[] = [
    'admin', 'strategist', 'ad_buyer', 'community_mgr', 'editor',
    'copywriter', 'videographer', 'photographer', 'client_owner',
    'client_manager', 'influencer',
  ]
  for (const r of order) {
    const hit = caps.find(c => c.role === r)
    if (hit) return hit
  }
  return caps[0] ?? null
}
