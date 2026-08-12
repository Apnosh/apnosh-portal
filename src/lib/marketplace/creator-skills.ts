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
  /** True when the work happens AT the restaurant (shoots, visits) — drives the
   *  coverage-area question in onboarding. Remote skills deliver from anywhere. */
  onSite: boolean
}

export const CREATOR_SKILLS: CreatorSkill[] = [
  /* On-site crafts: the work happens at the restaurant. */
  { id: 'photo', label: 'Photographer', emoji: '📷', desc: 'Food + space photos', category: 'photographer', dispatch: 'Photo', onSite: true },
  { id: 'video', label: 'Videographer', emoji: '🎬', desc: 'Reels + short video', category: 'videographer', dispatch: 'Video', onSite: true },
  { id: 'social', label: 'Food influencer', emoji: '📱', desc: 'Visits + posts to your audience', category: 'food_influencer', dispatch: 'Social', onSite: true },
  { id: 'agency', label: 'Full-service agency', emoji: '🏢', desc: 'The whole thing, done for you', category: 'full_service_agency', dispatch: 'Social', onSite: true },
  /* Remote crafts: delivered from anywhere. */
  { id: 'design', label: 'Designer', emoji: '🎨', desc: 'Menus, logos, graphics', category: 'graphic_designer', dispatch: 'Design', onSite: false },
  { id: 'web', label: 'Web / Sites', emoji: '🌐', desc: 'Sites + landing pages', category: 'web_designer', dispatch: 'Design', onSite: false },
  { id: 'marketing', label: 'Social media manager', emoji: '📈', desc: 'Posting + growth, month to month', category: 'social_manager', dispatch: 'Social', onSite: false },
  { id: 'seo', label: 'Local SEO', emoji: '🔍', desc: 'Show up when locals search', category: 'local_seo', dispatch: 'Social', onSite: false },
  { id: 'email', label: 'Email marketing', emoji: '📬', desc: 'Emails that bring guests back', category: 'email_marketer', dispatch: 'Social', onSite: false },
  { id: 'pr', label: 'PR / Press', emoji: '📰', desc: 'Press, features, local buzz', category: 'pr_specialist', dispatch: 'Social', onSite: false },
  { id: 'strategy', label: 'Marketing strategist', emoji: '🧭', desc: 'The plan behind it all', category: 'strategist', dispatch: 'Social', onSite: false },
  { id: 'writing', label: 'Writing / Content', emoji: '✍️', desc: 'Copy, captions, blogs', category: null, dispatch: 'Social', onSite: false },
]

/** Does any picked skill involve showing up in person? Drives the coverage-area ask. */
export function hasOnSiteSkill(ids: string[]): boolean {
  return ids.some((id) => BY_ID.get(id)?.onSite)
}

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

/** All 50 states + DC — used to extract matchable codes from typed places. */
const US_STATES = new Set(['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'])

/** True when the text names a US state ("WA" alone, or trailing like "Seattle, WA"). */
export function namesAState(place: string): boolean {
  const t = place.trim()
  if (US_STATES.has(t.toUpperCase())) return true
  const m = t.match(/[,\s]([A-Za-z]{2})$/)
  return !!m && US_STATES.has(m[1].toUpperCase())
}

/**
 * Split a comma-separated list of places, re-pairing "City, ST" — "Tacoma, WA, Portland, OR"
 * becomes ["Tacoma, WA", "Portland, OR"], not four orphaned tokens. A bare state code with no
 * city before it stays its own token.
 */
export function splitPlaces(raw: string): string[] {
  const parts = raw.split(',').map((t) => t.trim()).filter(Boolean)
  const out: string[] = []
  for (const part of parts) {
    const prev = out[out.length - 1]
    if (US_STATES.has(part.toUpperCase()) && prev && !namesAState(prev)) {
      out[out.length - 1] = `${prev}, ${part.toUpperCase()}`
    } else {
      out.push(part)
    }
  }
  return out
}

/**
 * Build the stored service_area array from human places. The store matches creators
 * by ARRAY CONTAINMENT of bare 2-letter state codes (vq.contains('service_area',
 * [state])), so this keeps the typed places AND extracts every state code they name
 * as its own token — cities stay readable for future geo routing, codes keep
 * today's matching working. Deduped, codes uppercased.
 */
export function buildServiceArea(base: string, coverage: string[]): string[] {
  const places = [base.trim(), ...coverage.map((c) => c.trim())].filter(Boolean)
  const out: string[] = []
  const push = (t: string) => { if (t && !out.includes(t)) out.push(t) }
  for (const place of places) {
    push(US_STATES.has(place.toUpperCase()) ? place.toUpperCase() : place)
    const m = place.match(/[,\s]([A-Za-z]{2})$/)
    if (m && US_STATES.has(m[1].toUpperCase())) push(m[1].toUpperCase())
  }
  return out
}
