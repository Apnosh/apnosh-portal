/**
 * Role catalog — the 17 capabilities + their display + category + scope.
 *
 * One source of truth for:
 *   - The capability enum values (must match supabase migration 101+106)
 *   - Display names + descriptions for UI
 *   - Whether a role scopes to specific clients or agency-wide
 *   - Which "type" (internal core / roster / marketplace / at-scale)
 *   - Which service lines this role typically touches
 *
 * Anyone (human or AI) writing UI for /admin/team or any role-aware
 * surface should pull from this file. Adding a role = one entry here +
 * an enum value in a migration.
 */

import type { RoleCapability } from '@/lib/auth/capabilities'

export type RoleCategory = 'strategy' | 'creative' | 'distribution' | 'engagement' | 'build' | 'insights' | 'ops'
export type RoleType = 'internal_core' | 'internal_at_scale' | 'roster' | 'marketplace'
export type ServiceLine = 'social' | 'website' | 'email' | 'local'

export interface RoleDef {
  /** Matches the role_capability enum value. */
  capability: RoleCapability
  /** Display name in UI. */
  label: string
  /** One-line description of what they do. */
  description: string
  /** Category for grouping. */
  category: RoleCategory
  /** Hire pattern: internal vs roster vs marketplace. */
  type: RoleType
  /** Whether the role scopes to specific clients (true) or agency-wide (false). */
  clientScoped: boolean
  /** Which service lines this role typically touches. */
  serviceLines: ServiceLine[]
  /** Accent color slug used in workspace switcher + chips. */
  accent: 'emerald' | 'violet' | 'amber' | 'rose' | 'indigo' | 'sky' | 'teal' | 'pink' | 'ink' | 'brand'
  /** Where a person in this role lands after login. */
  landingPath: string
}

export const ROLES: RoleDef[] = [
  // ───── Strategy ─────
  {
    capability: 'strategist',
    label: 'Strategist',
    description: 'Account lead. Owns the client relationship, sets monthly themes, approves content, sends quotes.',
    category: 'strategy',
    type: 'internal_core',
    clientScoped: true,
    serviceLines: ['social','website','email','local'],
    accent: 'emerald',
    landingPath: '/work/today',
  },

  // ───── Creative production ─────
  {
    capability: 'designer',
    label: 'Designer',
    description: 'Graphics, brand visuals, layout, email templates. Proposes visual directions within themes.',
    category: 'creative',
    type: 'internal_core',
    clientScoped: false,
    serviceLines: ['social','website','email'],
    accent: 'pink',
    landingPath: '/work/queue',
  },
  {
    capability: 'copywriter',
    label: 'Copywriter',
    description: 'Captions, email copy, web copy, local blog. Generates specific post ideas within themes.',
    category: 'creative',
    type: 'internal_core',
    clientScoped: false,
    serviceLines: ['social','website','email','local'],
    accent: 'sky',
    landingPath: '/work/briefs',
  },
  {
    capability: 'editor',
    label: 'Video Editor',
    description: 'Color, cuts, motion, captions on video. Internal at scale, roster contractor early.',
    category: 'creative',
    type: 'roster',
    clientScoped: false,
    serviceLines: ['social'],
    accent: 'indigo',
    landingPath: '/work/edits',
  },
  {
    capability: 'visual_creator',
    label: 'Visual Creator',
    description: 'On-site photo / video shoots. Specialty declared per person (photo, video, or both).',
    category: 'creative',
    type: 'roster',
    clientScoped: false,
    serviceLines: ['social','website','local'],
    accent: 'amber',
    landingPath: '/work/shoots',
  },
  {
    capability: 'videographer',
    label: 'Videographer (legacy)',
    description: 'Legacy: video-only specialty. New hires use Visual Creator with metadata.specialty.',
    category: 'creative',
    type: 'roster',
    clientScoped: false,
    serviceLines: ['social','website'],
    accent: 'amber',
    landingPath: '/work/shoots',
  },
  {
    capability: 'photographer',
    label: 'Photographer (legacy)',
    description: 'Legacy: photo-only specialty. New hires use Visual Creator with metadata.specialty.',
    category: 'creative',
    type: 'roster',
    clientScoped: false,
    serviceLines: ['social','website','local'],
    accent: 'rose',
    landingPath: '/work/shoots',
  },
  {
    capability: 'influencer',
    label: 'Creator (UGC)',
    description: 'Influencer / UGC creator. Per-campaign. Browses the marketplace + applies.',
    category: 'creative',
    type: 'marketplace',
    clientScoped: false,
    serviceLines: ['social'],
    accent: 'pink',
    landingPath: '/marketplace',
  },

  // ───── Distribution & paid ─────
  {
    capability: 'paid_media',
    label: 'Paid Media',
    description: 'Boosts, Google Ads, audience targeting across paid channels.',
    category: 'distribution',
    type: 'internal_core',
    clientScoped: true,
    serviceLines: ['social','website','email'],
    accent: 'violet',
    landingPath: '/work/boosts',
  },
  {
    capability: 'ad_buyer',
    label: 'Ad Buyer (legacy)',
    description: 'Legacy alias for Paid Media. New hires use paid_media.',
    category: 'distribution',
    type: 'internal_core',
    clientScoped: true,
    serviceLines: ['social','website'],
    accent: 'violet',
    landingPath: '/work/boosts',
  },
  {
    capability: 'email_specialist',
    label: 'Email Specialist',
    description: 'Automation, drips, segmentation, deliverability. (SMS folds in later.)',
    category: 'distribution',
    type: 'internal_core',
    clientScoped: false,
    serviceLines: ['email'],
    accent: 'teal',
    landingPath: '/work/email',
  },
  {
    capability: 'local_seo',
    label: 'Local SEO',
    description: 'GBP, citations, schema, local content. Owns reputation strategy.',
    category: 'distribution',
    type: 'internal_core',
    clientScoped: true,
    serviceLines: ['local'],
    accent: 'emerald',
    landingPath: '/work/local',
  },
  {
    capability: 'web_ops',
    label: 'Web Ops',
    description: 'Small site changes, content swaps, hours updates.',
    category: 'distribution',
    type: 'internal_core',
    clientScoped: true,
    serviceLines: ['website'],
    accent: 'sky',
    landingPath: '/work/web',
  },

  // ───── Engagement ─────
  {
    capability: 'community_mgr',
    label: 'Community Manager',
    description: 'DMs, comments, review responses. Day-to-day client-facing engagement.',
    category: 'engagement',
    type: 'internal_core',
    clientScoped: true,
    serviceLines: ['social','local'],
    accent: 'teal',
    landingPath: '/work/engage',
  },

  // ───── Build (project-based) ─────
  {
    capability: 'web_designer',
    label: 'Web Designer',
    description: 'Big redesigns, new templates, brand refreshes for the website.',
    category: 'build',
    type: 'roster',
    clientScoped: false,
    serviceLines: ['website'],
    accent: 'rose',
    landingPath: '/work/web-projects',
  },
  {
    capability: 'web_developer',
    label: 'Web Developer',
    description: 'Custom features, integrations, technical builds.',
    category: 'build',
    type: 'roster',
    clientScoped: false,
    serviceLines: ['website'],
    accent: 'indigo',
    landingPath: '/work/web-projects',
  },

  // ───── Insights ─────
  {
    capability: 'data_analyst',
    label: 'Data Analyst',
    description: 'Cross-channel reporting, attribution, deep dives. (At scale.)',
    category: 'insights',
    type: 'internal_at_scale',
    clientScoped: false,
    serviceLines: ['social','website','email','local'],
    accent: 'sky',
    landingPath: '/work/reports',
  },

  // ───── Ops ─────
  {
    capability: 'onboarder',
    label: 'Onboarder',
    description: 'Onboards new clients, gets them launched, trains them.',
    category: 'ops',
    type: 'internal_core',
    clientScoped: true,
    serviceLines: ['social','website','email','local'],
    accent: 'amber',
    landingPath: '/work/onboarding',
  },
  {
    capability: 'admin',
    label: 'Admin / Owner',
    description: 'Full system access. Agency settings, hiring, finances.',
    category: 'ops',
    type: 'internal_core',
    clientScoped: false,
    serviceLines: ['social','website','email','local'],
    accent: 'ink',
    landingPath: '/admin',
  },
  {
    capability: 'finance',
    label: 'Finance',
    description: 'Invoices, collections, vendor pay. (At scale.)',
    category: 'ops',
    type: 'internal_at_scale',
    clientScoped: false,
    serviceLines: ['social','website','email','local'],
    accent: 'ink',
    landingPath: '/admin/billing',
  },

  // ───── Client-side ─────
  {
    capability: 'client_owner',
    label: 'Owner',
    description: 'Restaurant owner using the client portal. Receives reports, approves content.',
    category: 'ops',
    type: 'internal_core',
    clientScoped: true,
    serviceLines: ['social','website','email','local'],
    accent: 'brand',
    landingPath: '/dashboard',
  },
  {
    capability: 'client_manager',
    label: 'Manager',
    description: 'Client-side staff member (FOH / marketing) with portal access.',
    category: 'ops',
    type: 'internal_core',
    clientScoped: true,
    serviceLines: ['social','website','email','local'],
    accent: 'brand',
    landingPath: '/dashboard',
  },
]

export const ROLES_BY_CAPABILITY: Record<string, RoleDef> = Object.fromEntries(
  ROLES.map(r => [r.capability, r]),
)

export const CATEGORY_LABELS: Record<RoleCategory, string> = {
  strategy:     'Strategy',
  creative:     'Creative',
  distribution: 'Distribution & paid',
  engagement:   'Engagement',
  build:        'Build (projects)',
  insights:     'Insights',
  ops:          'Operations',
}

export const TYPE_LABELS: Record<RoleType, string> = {
  internal_core:     'Internal core',
  internal_at_scale: 'At scale',
  roster:            'Roster contractor',
  marketplace:       'Marketplace',
}

/**
 * Roles you typically invite when staffing a real agency. Excludes
 * legacy aliases (videographer, photographer, ad_buyer) and client-
 * portal-side capabilities (client_owner, client_manager).
 */
export const INVITABLE_ROLES: RoleDef[] = ROLES.filter(r =>
  !['videographer','photographer','ad_buyer','client_owner','client_manager','admin'].includes(r.capability),
)

/**
 * Which /work surfaces are relevant to each capability. Admin sees
 * everything implicitly. The /work layout reads this to compute the
 * union of nav items for whatever capabilities the user holds.
 *
 * Key = capability, Value = array of /work paths the holder should
 * see in their nav.
 */
export const WORK_SURFACES_BY_CAPABILITY: Partial<Record<RoleCapability, string[]>> = {
  strategist: [
    '/work/today', '/work/inbox', '/work/approvals', '/work/calendar',
    '/work/themes', '/work/drafts',
    '/work/clients', '/work/specialists', '/work/quotes',
    '/work/performance',
  ],
  copywriter: [
    '/work/today',     // shared workday hub
    '/work/briefs',    // copywriter's queue (drafts that need caption work)
    '/work/themes',    // read-only — see the angle for context
    '/work/drafts',    // see all drafts; can edit captions on revising drafts
    '/work/performance',
  ],
  designer: [
    '/work/today',
    '/work/queue',     // design queue (deferred)
    '/work/themes',
    '/work/drafts',
  ],
  community_mgr: [
    '/work/today',
    '/work/engage',    // already shipped (was role-gated)
  ],
  paid_media: [
    '/work/today',
    '/work/boosts',    // already shipped
  ],
  editor: [
    '/work/today',
    '/work/edits',     // already shipped
  ],
  visual_creator: [
    '/work/shoots',    // already shipped
  ],
  videographer: ['/work/shoots'],   // legacy
  photographer: ['/work/shoots'],   // legacy
  influencer: ['/marketplace'],
  local_seo: ['/work/today', '/work/reviews'],
  web_ops: ['/work/today', '/work/web'],
  web_designer: ['/work/today', '/work/web'],
  web_developer: ['/work/today', '/work/web'],
  email_specialist: ['/work/today', '/work/campaigns'],
  onboarder: ['/work/today', '/work/onboarding', '/work/specialists'],
  data_analyst: ['/work/performance'],
  finance: ['/work/today', '/work/billing'],
}
