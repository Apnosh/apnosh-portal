/**
 * Server half of the campaign-content CMS overlay (Phase C1). Reads the sparse
 * catalog_content_overrides rows via the service-role client and overlays each
 * row's non-null columns onto the canonical in-code CAMPAIGN_CONTENT records.
 *
 * DEGRADES GRACEFULLY by design: the owner may not have applied migration 203
 * yet, so a missing table, a missing service key, or any query error returns
 * the code records unchanged (and an empty override map) — never a crash.
 *
 * Server-side only (needs SUPABASE_SERVICE_ROLE_KEY at call time); never import
 * from a client component. Not marked 'server-only' so the CI harness can
 * exercise the fallback path directly.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { CAMPAIGN_CONTENT, type CampaignContent } from './data/campaign-content'
import { contentFor, type ContentOverride, type ContentOverrideMap } from './data/content-overrides'
import type { CreateCatalogId } from './data/create-catalog'

/** The raw catalog_content_overrides row shape (all content columns nullable). */
export interface ContentOverrideRow {
  item_id: string
  title: string | null
  tagline: string | null
  description: string | null
  promise: string | null
  why: string | null
  expectation: string | null
  hero_image: string | null
  best_for: string | null
  faq: unknown
  updated_at?: string | null
  updated_by?: string | null
}

const text = (v: string | null | undefined): string | undefined =>
  typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined

/** snake_case row -> sparse ContentOverride. NULL/empty columns are DROPPED so the
 *  payload stays tiny and the client merge can never mistake "not edited" for content. */
export function rowToOverride(row: ContentOverrideRow): ContentOverride {
  const o: ContentOverride = {}
  const title = text(row.title); if (title) o.title = title
  const tagline = text(row.tagline); if (tagline) o.tagline = tagline
  const description = text(row.description); if (description) o.description = description
  const promise = text(row.promise); if (promise) o.promise = promise
  const why = text(row.why); if (why) o.why = why
  const expectation = text(row.expectation); if (expectation) o.expectation = expectation
  const heroImage = text(row.hero_image); if (heroImage) o.heroImage = heroImage
  const bestFor = text(row.best_for); if (bestFor) o.bestFor = bestFor
  if (Array.isArray(row.faq)) {
    const faq = (row.faq as { q?: unknown; a?: unknown }[])
      .filter((f) => f && typeof f.q === 'string' && f.q.trim() && typeof f.a === 'string' && f.a.trim())
      .map((f) => ({ q: (f.q as string).trim(), a: (f.a as string).trim() }))
    if (faq.length) o.faq = faq
  }
  return o
}

/** All override rows as a sparse map (only ids with at least one edited field).
 *  {} on ANY failure — missing table, missing env, network — never throws. */
export async function getContentOverrides(): Promise<ContentOverrideMap> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.from('catalog_content_overrides').select('*')
    if (error || !data) return {}
    const map: ContentOverrideMap = {}
    for (const row of data as ContentOverrideRow[]) {
      if (typeof row?.item_id !== 'string' || !(row.item_id in CAMPAIGN_CONTENT)) continue
      const o = rowToOverride(row)
      if (Object.keys(o).length) map[row.item_id] = o
    }
    return map
  } catch {
    return {}
  }
}

/** The full content set the server renders from: every code record, with any
 *  admin-edited fields laid over it. With no overrides (or any read failure)
 *  this is exactly CAMPAIGN_CONTENT. */
export async function getMergedCampaignContent(): Promise<Record<CreateCatalogId, CampaignContent>> {
  const overrides = await getContentOverrides()
  if (!Object.keys(overrides).length) return CAMPAIGN_CONTENT
  const merged = {} as Record<CreateCatalogId, CampaignContent>
  for (const id of Object.keys(CAMPAIGN_CONTENT) as CreateCatalogId[]) {
    merged[id] = contentFor(id, overrides) ?? CAMPAIGN_CONTENT[id]
  }
  return merged
}
