/**
 * Campaign content OVERRIDES (Phase C1 of the campaign-catalog systemization) — the
 * client-safe half of the CMS overlay. The admin CMS writes sparse override rows
 * (catalog_content_overrides); this module merges one campaign's override onto its
 * canonical in-code record at render time.
 *
 * HONESTY: the overlay never invents content. A field only replaces the code default
 * when the admin actually typed something (non-empty after trim); everything else
 * falls back to CAMPAIGN_CONTENT. No override map at all (fetch failed, table not
 * applied yet, nothing edited) means the store renders pure code content.
 * CLIENT-SAFE: pure data merge, no server imports.
 */

import { campaignContent, type CampaignContent } from './campaign-content'
import type { FunnelStage } from './create-catalog'

/** One "how it's done" lane (a tab in the product-page picker). Display/draft only for now. */
export interface CampaignLane {
  label: string
  /** Free-text price shown under the tab: "$100", "Free", "Included". */
  price: string
  /** Pro badge on the tab. */
  pro?: boolean
  /** The detail line shown under the tabs when this lane is selected. */
  detail?: string
}

/** Sparse edited fields for one campaign. Absent/empty = use the code default. */
export interface ContentOverride {
  title?: string
  tagline?: string
  description?: string
  promise?: string
  why?: string
  expectation?: string
  heroImage?: string
  bestFor?: string
  faq?: { q: string; a: string }[]
  /** Re-tagged product-page funnel chips. Absent = the card's built-in stages. */
  stages?: FunnelStage[]
  /** Edited "how it's done" lanes. Absent = the card's built-in lanes. Draft/display only. */
  lanes?: CampaignLane[]
  /** Edited "what we'll need from you" list. Absent = the list derived from services. */
  requirements?: string[]
}

/** Trim, drop empties + dupes, cap — the store contract for a plain string list. */
export function cleanStringList(v: unknown, cap = 8): string[] {
  if (!Array.isArray(v)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of v) {
    if (typeof raw !== 'string') continue
    const s = raw.trim()
    if (!s || seen.has(s)) continue
    seen.add(s)
    out.push(s)
    if (out.length >= cap) break
  }
  return out
}

/** Keep only well-formed lanes (a real label), trimmed, capped — the store contract. */
export function cleanLanes(v: unknown): CampaignLane[] {
  if (!Array.isArray(v)) return []
  const out: CampaignLane[] = []
  for (const raw of v) {
    if (!raw || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    const label = typeof r.label === 'string' ? r.label.trim() : ''
    if (!label) continue
    out.push({
      label,
      price: typeof r.price === 'string' && r.price.trim() ? r.price.trim() : 'Free',
      pro: !!r.pro,
      detail: typeof r.detail === 'string' && r.detail.trim() ? r.detail.trim() : undefined,
    })
    if (out.length >= 4) break
  }
  return out
}

/** item_id -> its edited fields. Only edited campaigns appear at all. */
export type ContentOverrideMap = Record<string, ContentOverride>

const filled = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0

/** The one resolver the render layers use: the code record with any admin-edited
 *  fields laid over it. Null only when the id itself is unknown. */
export function contentFor(itemId: string, overrides?: ContentOverrideMap | null): CampaignContent | null {
  const base = campaignContent(itemId)
  if (!base) return null
  const o = overrides?.[itemId]
  if (!o) return base
  const merged: CampaignContent = { ...base }
  if (filled(o.title)) merged.title = o.title.trim()
  if (filled(o.tagline)) merged.tagline = o.tagline.trim()
  if (filled(o.description)) merged.description = o.description.trim()
  if (filled(o.promise)) merged.promise = o.promise.trim()
  if (filled(o.why)) merged.why = o.why.trim()
  if (filled(o.expectation)) merged.expectation = o.expectation.trim()
  if (filled(o.heroImage)) merged.heroImage = o.heroImage.trim()
  if (filled(o.bestFor)) merged.bestFor = o.bestFor.trim()
  if (Array.isArray(o.faq)) {
    const faq = o.faq.filter((f) => f && filled(f.q) && filled(f.a)).map((f) => ({ q: f.q.trim(), a: f.a.trim() }))
    if (faq.length) merged.faq = faq
  }
  if (Array.isArray(o.stages) && o.stages.length) merged.stages = o.stages
  if (Array.isArray(o.lanes) && o.lanes.length) merged.lanes = o.lanes
  if (Array.isArray(o.requirements) && o.requirements.length) merged.requirements = o.requirements
  return merged
}
