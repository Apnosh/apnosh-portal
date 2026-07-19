/**
 * Shared validation for the admin DB-campaign API (Phase C2). One place turns an
 * untrusted request body into a clean catalog_campaigns row payload, enforcing:
 *   - id: valid slug, never a built-in catalog id (the union + composer + JSX ids)
 *   - vocab: type / cad / shelf / stages from the closed sets the render layer uses
 *   - services: every id must exist in the priced catalog; >= 1 required (a campaign
 *     with nothing real to sell cannot be saved); add-ons must be recurring-capable
 *   - copy: the same em-dash guard the C1 content routes enforce
 *   - live: all core content non-empty (title, tagline, description, promise, why,
 *     expectation) — a half-authored campaign can be a draft, never live
 * No price, deliverable, or timeline fields exist to validate — those all derive.
 */

import {
  DB_CADENCES, DB_CARD_TYPES, DB_SHELVES, DB_STAGES,
  isBuiltinCampaignId, isValidCampaignSlug,
} from '@/lib/campaigns/data/db-campaigns'
import { serviceById, cadenceOf } from '@/lib/campaigns/catalog'
import { cleanGatesConfig, type CampaignGatesConfig } from '@/lib/campaigns/gates/config'
import { cleanNeeds, type CampaignNeedsConfig } from '@/lib/campaigns/data/content-overrides'

export interface CampaignRowPayload {
  title: string
  tagline: string | null
  description: string | null
  promise: string | null
  why: string | null
  expectation: string | null
  hero_image: string | null
  best_for: string | null
  faq: { q: string; a: string }[] | null
  type: string
  cad: string
  shelf: string
  stages: string[]
  service_ids: string[]
  addon_service_ids: string[]
  status: 'draft' | 'live'
  gates: CampaignGatesConfig | null
  needs: CampaignNeedsConfig | null
}

const clean = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
const strArray = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim()) : [])

export function validateCampaignId(id: unknown): string | { error: string } {
  if (typeof id !== 'string' || !isValidCampaignSlug(id)) {
    return { error: 'id must be a lowercase slug (letters, numbers, dashes), 2 to 60 characters' }
  }
  if (isBuiltinCampaignId(id)) return { error: `"${id}" is a built-in campaign id. Pick a different slug.` }
  return id
}

/** Body → row payload, or a plain-words error. */
export function validateCampaignBody(body: unknown): CampaignRowPayload | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'invalid body' }
  const b = body as Record<string, unknown>

  const title = clean(b.title)
  if (!title) return { error: 'title is required' }

  const type = clean(b.type) ?? 'task'
  if (!(DB_CARD_TYPES as readonly string[]).includes(type)) return { error: `type must be one of: ${DB_CARD_TYPES.join(', ')}` }
  const cad = clean(b.cad) ?? 'once'
  if (!(DB_CADENCES as readonly string[]).includes(cad)) return { error: `cad must be one of: ${DB_CADENCES.join(', ')}` }
  const shelf = clean(b.shelf) ?? 'aware'
  if (!(DB_SHELVES as readonly string[]).includes(shelf)) return { error: `shelf must be one of: ${DB_SHELVES.join(', ')}` }

  const stages = strArray(b.stages)
  const badStage = stages.find((s) => !(DB_STAGES as readonly string[]).includes(s))
  if (badStage) return { error: `unknown stage "${badStage}" (allowed: ${DB_STAGES.join(', ')})` }

  const serviceIds = [...new Set(strArray(b.serviceIds))]
  const badService = serviceIds.find((id) => !serviceById(id))
  if (badService) return { error: `unknown service id "${badService}"` }
  if (!serviceIds.length) return { error: 'pick at least one real service. The campaign IS its services.' }

  const addonServiceIds = [...new Set(strArray(b.addonServiceIds))].filter((id) => !serviceIds.includes(id))
  for (const id of addonServiceIds) {
    const s = serviceById(id)
    if (!s) return { error: `unknown add-on service id "${id}"` }
    if (cadenceOf(s).cadence.kind !== 'recurring') return { error: `add-on "${id}" is not a recurring service (add-ons must be recurring-capable)` }
  }

  const faqRaw = Array.isArray(b.faq) ? (b.faq as { q?: unknown; a?: unknown }[]) : []
  const faq = faqRaw
    .filter((f) => f && typeof f.q === 'string' && f.q.trim() && typeof f.a === 'string' && f.a.trim())
    .map((f) => ({ q: (f.q as string).trim(), a: (f.a as string).trim() }))

  const status = b.status === 'live' ? 'live' : 'draft'

  const payload: CampaignRowPayload = {
    title,
    tagline: clean(b.tagline),
    description: clean(b.description),
    promise: clean(b.promise),
    why: clean(b.why),
    expectation: clean(b.expectation),
    hero_image: clean(b.heroImage),
    best_for: clean(b.bestFor),
    faq: faq.length ? faq : null,
    type, cad, shelf, stages,
    service_ids: serviceIds,
    addon_service_ids: addonServiceIds,
    status,
    gates: cleanGatesConfig(b.gates) ?? null,
    needs: cleanNeeds(b.needs) ?? null,
  }

  // Same copy rule the code records + C1 overrides live under: no em dashes reach the store.
  const emDashFields = (
    [['title', payload.title], ['tagline', payload.tagline], ['description', payload.description],
     ['promise', payload.promise], ['why', payload.why], ['expectation', payload.expectation],
     ['bestFor', payload.best_for]] as [string, string | null][]
  ).filter(([, v]) => typeof v === 'string' && v.includes('—')).map(([k]) => k)
  if (faq.some((f) => f.q.includes('—') || f.a.includes('—'))) emDashFields.push('faq')
  if (emDashFields.length) {
    return { error: `Use a comma or period instead of an em dash (${emDashFields.join(', ')}).` }
  }

  // Going live is a promise to the store: every core sell field must exist.
  if (status === 'live') {
    const missing = (
      [['tagline', payload.tagline], ['description', payload.description], ['promise', payload.promise],
       ['why', payload.why], ['expectation', payload.expectation]] as [string, string | null][]
    ).filter(([, v]) => !v).map(([k]) => k)
    if (missing.length) return { error: `a live campaign needs every core field filled (missing: ${missing.join(', ')})` }
  }

  return payload
}

/** Missing-table errors read as a setup problem, not a crash (same matcher as C1). */
export function tableMissing(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false
  if (err.code === 'PGRST205' || err.code === '42P01') return true
  return !!err.message && /could not find the table|relation .* does not exist/i.test(err.message)
}
export const SETUP_MSG = 'The catalog_campaigns table is not set up yet. Apply migration 204 in the Supabase SQL editor first.'
