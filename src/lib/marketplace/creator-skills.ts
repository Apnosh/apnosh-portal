/**
 * CREATOR SKILLS — the owner-facing list of what a freelancer does. A creator can pick SEVERAL
 * (a photographer who also shoots video and runs social), so this is the multi-select vocabulary
 * stored in `vendors.crafts text[]`.
 *
 * Two other vocabularies already exist and this maps onto both, so nothing downstream has to change:
 *   - `category` (PackageCategory, 12 values): the fine, per-OFFERING taxonomy the storefront +
 *     profile already key off. `category` here suggests which catalog products a skill can sell.
 *   - `dispatch` ('Video'|'Photo'|'Social'|'Design'): the coarse scalar `vendors.craft` the campaign
 *     auto-router matches on. We keep the scalar craft set to the PRIMARY skill's dispatch for
 *     back-compat, and widen the router to also match any of a creator's skills (see vendor-supply).
 *
 * Pure data + lookups, no I/O, no server-only imports — safe to import from the onboarding wizard.
 */

import type { PackageCategory } from './package'

/** The coarse dispatch domain (mirrors Disc in creators.ts, redeclared here to stay client-safe). */
export type Dispatch = 'Video' | 'Photo' | 'Social' | 'Design'

export interface CreatorSkill {
  /** Stable id, stored in vendors.crafts. */
  id: string
  label: string
  emoji: string
  desc: string
  /** The catalog product category this skill sells, or null when it has no standard menu yet. */
  category: PackageCategory | null
  /** The coarse craft the campaign router uses. */
  dispatch: Dispatch
}

export const CREATOR_SKILLS: CreatorSkill[] = [
  { id: 'photo', label: 'Photographer', emoji: '📷', desc: 'Food + space photos', category: 'photographer', dispatch: 'Photo' },
  { id: 'video', label: 'Videographer', emoji: '🎬', desc: 'Reels + short video', category: 'videographer', dispatch: 'Video' },
  { id: 'social', label: 'Social / Influencer', emoji: '📱', desc: 'Posts to your audience', category: 'food_influencer', dispatch: 'Social' },
  { id: 'design', label: 'Designer', emoji: '🎨', desc: 'Menus, logos, graphics', category: 'graphic_designer', dispatch: 'Design' },
  { id: 'web', label: 'Web / Sites', emoji: '🌐', desc: 'Sites + landing pages', category: 'web_designer', dispatch: 'Design' },
  { id: 'marketing', label: 'Marketing / SEO', emoji: '📈', desc: 'Social + local SEO', category: 'social_manager', dispatch: 'Social' },
  { id: 'writing', label: 'Writing / Content', emoji: '✍️', desc: 'Copy, captions, blogs', category: null, dispatch: 'Social' },
]

const BY_ID = new Map(CREATOR_SKILLS.map((s) => [s.id, s]))

export function skillById(id: string): CreatorSkill | undefined {
  return BY_ID.get(id)
}

/** The scalar dispatch craft for the campaign router: the primary (first) valid skill's dispatch,
 *  defaulting to 'Photo' so the column is never empty. */
export function dispatchForSkills(ids: string[]): Dispatch {
  for (const id of ids) {
    const s = BY_ID.get(id)
    if (s) return s.dispatch
  }
  return 'Photo'
}

/** The catalog product categories a creator's skills map to (deduped, in pick order; skills with no
 *  standard menu are dropped). Drives which first-offering products to show in onboarding. */
export function categoriesForSkills(ids: string[]): PackageCategory[] {
  const out: PackageCategory[] = []
  for (const id of ids) {
    const s = BY_ID.get(id)
    if (s?.category && !out.includes(s.category)) out.push(s.category)
  }
  return out
}

/** Owner-facing labels for a set of skill ids (unknown ids dropped). */
export function labelsForSkills(ids: string[]): string[] {
  return ids.map((id) => BY_ID.get(id)?.label).filter((x): x is string => !!x)
}

/** The skill ids that dispatch to a given craft — the reverse of `dispatch`. Used by the campaign
 *  router to match a job discipline against a creator's whole skill set (not just their primary). */
export function skillIdsForDispatch(d: Dispatch): string[] {
  return CREATOR_SKILLS.filter((s) => s.dispatch === d).map((s) => s.id)
}
