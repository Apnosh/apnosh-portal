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
  return merged
}
