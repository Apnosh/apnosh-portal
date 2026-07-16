/**
 * DB campaigns (Phase C2 of the campaign-catalog systemization) — the client-safe core
 * for admin-CREATED catalog campaigns. A DB campaign is a catalog_campaigns row: authored
 * content + real priced-catalog serviceIds. Everything else DERIVES from those services:
 *
 *  - pricing    -> the adapter's svcLines rail (registerItemPrice → draftFromBuilder)
 *  - what you get -> the services' real catalog deliverables (what-you-get.ts)
 *  - requirements -> turnaround gates (campaign-requirements.ts)
 *  - timeline   -> SERVICE_TURNAROUND (configTimeline in the JSX)
 *
 * HONESTY BY CONSTRUCTION: there is no free-text price, deliverable, or timeline field
 * anywhere on a DB campaign; the registered shape is services-only (empty seed, kind
 * 'setup'), so the composer can never grow content for it and the composed draft flows
 * through the EXACT save/ship path a built-in services-only card (listings) uses.
 *
 * DB campaign ids live OUTSIDE the CreateCatalogId union on purpose: the union stays a
 * compile-time guarantee for code-authored cards; DB ids resolve through the runtime
 * registries (shapeFor / campaignContent / ITEM_PRICES) that every render+compose layer
 * already consults. Registration refuses built-in ids, so nothing can be shadowed.
 *
 * CLIENT-SAFE: pure data + registration, no server imports, no fetch.
 */

import type { FunnelStage } from './create-catalog'
import type { CampaignGatesConfig } from '../gates/config'
import type { CampaignNeedsConfig } from './content-overrides'
import { CAMPAIGN_CONTENT, registerDynamicCampaignContent, type CampaignContent } from './campaign-content'
import type { CreateCatalogId } from './create-catalog'
import { ITEM_SHAPE, registerDynamicShape, type Dur, type ItemShape } from '../builder/compose-plan'
import { registerItemPrice, formatItemPrice, type ItemPrice } from '../builder/item-prices'
import { serviceById, serviceToLines } from '../catalog'
import { summarize } from '../types'

/* ── The closed vocabularies a DB campaign may use (read from the real render layer:
 *    TYPE_G card types, CADENCE_TAG cadences, ROWS shelf ids, FunnelStage). The admin
 *    API validates against these; the JSX renders them without special cases. ── */
export const DB_CARD_TYPES = ['plan', 'content', 'email', 'task', 'automation'] as const
export type DbCardType = (typeof DB_CARD_TYPES)[number]

export const DB_CADENCES = ['once', 'recurring', 'auto', 'setup', 'group'] as const
export type DbCadence = (typeof DB_CADENCES)[number]

/** Store shelves an admin card can sit on ('suggested' is the AI row and stays off-limits). */
export const DB_SHELVES = ['aware', 'interest', 'actions', 'orders', 'back', 'programs', 'content'] as const
export type DbShelf = (typeof DB_SHELVES)[number]

export const DB_STAGES: readonly FunnelStage[] = ['aware', 'interest', 'actions', 'orders', 'back']

/** One admin-created campaign, as served to the owner store (snake_case row → this). */
export interface DbCampaign {
  id: string
  title: string
  tagline: string
  description: string
  promise: string
  why: string
  expectation: string
  heroImage: string | null
  bestFor?: string
  faq?: { q: string; a: string }[]
  type: DbCardType
  cad: DbCadence
  shelf: DbShelf
  stages: FunnelStage[]
  serviceIds: string[]
  addonServiceIds: string[]
  status: 'draft' | 'live'
  /** Owner config for pre-checkout gates (Phase 4a). Absent = smart defaults. */
  gates?: CampaignGatesConfig
  /** Owner config for the post-checkout "needs from you" step (G10). Absent = smart defaults. */
  needs?: CampaignNeedsConfig
}

/** Slug rule for a DB campaign id: lowercase kebab, 2-60 chars. */
export const CAMPAIGN_SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/
export function isValidCampaignSlug(id: string): boolean {
  return typeof id === 'string' && id.length >= 2 && id.length <= 60 && CAMPAIGN_SLUG_RE.test(id)
}

/** Derive a slug from a title (the admin form's auto-slug). */
export function slugFromTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '')
}

/** Every id a DB campaign must NOT collide with: the render catalog / content record ids,
 *  the composer's extra shape ids (carousel, second, deal, reviews…), and the JSX's
 *  pseudo-routes. One set, so the admin API and the client validate identically. */
const RESERVED_IDS = new Set<string>([
  ...Object.keys(CAMPAIGN_CONTENT),
  ...Object.keys(ITEM_SHAPE),
  'featured', '__else', 'new', 'estimate',
])
export function isBuiltinCampaignId(id: string): boolean {
  return RESERVED_IDS.has(id)
}

/** Real prices for a bare service list, in the SAME shape/rounding as ITEM_PRICES — used
 *  by the admin preview before a campaign exists. Byte-equal to the adapter's svcLines
 *  rail for a services-only shape (each price point of each service becomes a line). */
export function priceForServices(serviceIds: string[]): ItemPrice {
  const lines = serviceIds.flatMap((id, i) => {
    const s = serviceById(id)
    return s ? serviceToLines(s, `pv-${i}`) : []
  })
  const bill = summarize(lines)
  return { oneTime: Math.round(bill.oneTimeOnDelivery), perMonth: Math.round(bill.perMonth) }
}

/** The admin preview's price label — same wording rail as the store's priceLabel. */
export function priceLabelForServices(serviceIds: string[]): string | null {
  return formatItemPrice(priceForServices(serviceIds))
}

/* ── Registration: DB campaign → the runtime registries every layer already reads ── */

const CAD_DUR: Record<DbCadence, Dur> = { once: 'once', recurring: 'ongoing', auto: 'ongoing', setup: 'setup', group: 'short' }

/** The services-only shape a DB campaign composes with. kind 'setup' + empty seed by
 *  construction: never funnel-grown, never event-playbooked — the plan IS its services,
 *  exactly like the built-in 'listings' card. */
function dbShape(c: DbCampaign): ItemShape {
  return {
    title: c.title,
    kind: 'setup',
    // Retention-tagged campaigns brief as retention; everything else as acquisition.
    // This only picks the brief's goal words — money and services are untouched by it.
    goal: c.stages.includes('back') ? 'retain' : 'acquire',
    dur: CAD_DUR[c.cad] ?? 'once',
    seed: [],
    services: [...c.serviceIds],
  }
}

function dbContent(c: DbCampaign): CampaignContent {
  return {
    // DB ids sit outside the compile-time union by design; the registries are the
    // runtime-safe lane for them (see the module comment).
    id: c.id as CreateCatalogId,
    title: c.title,
    tagline: c.tagline,
    description: c.description,
    promise: c.promise,
    why: c.why,
    expectation: c.expectation,
    heroImage: c.heroImage,
    ...(c.bestFor ? { bestFor: c.bestFor } : {}),
    ...(c.faq?.length ? { faq: c.faq } : {}),
  }
}

/** Wire a fetched DB campaign list into the runtime: its compose shape, its content
 *  record, and its price (through the same draftFromBuilder rail as every built-in).
 *  Skips built-in id collisions and campaigns with no real services. Idempotent —
 *  re-registering picks up edits. Returns the campaigns that actually registered. */
export function registerDbCampaigns(list: DbCampaign[] | null | undefined): DbCampaign[] {
  const out: DbCampaign[] = []
  for (const c of list ?? []) {
    if (!c || !isValidCampaignSlug(c.id) || isBuiltinCampaignId(c.id)) continue
    const serviceIds = (c.serviceIds ?? []).filter((id) => !!serviceById(id))
    if (!serviceIds.length) continue // a campaign with nothing real to sell never registers
    const safe: DbCampaign = { ...c, serviceIds, addonServiceIds: (c.addonServiceIds ?? []).filter((id) => !!serviceById(id)) }
    registerDynamicShape(safe.id, dbShape(safe))
    registerDynamicCampaignContent(safe.id, dbContent(safe))
    registerItemPrice(safe.id)
    out.push(safe)
  }
  return out
}
