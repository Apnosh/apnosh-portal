/**
 * Server half of the DB-campaign catalog (Phase C2) — sibling of the C1 merge layer
 * (content-overrides-server.ts). Reads catalog_campaigns rows via the service-role
 * client and coerces them into the client-safe DbCampaign shape.
 *
 * DEGRADES GRACEFULLY by design: the owner may not have applied migration 204 yet, so
 * a missing table, a missing service key, or any query error returns [] — never a crash;
 * the store then simply shows no admin-created campaigns.
 *
 * Coercion is defensive: unknown service ids are dropped, vocab fields snap to their
 * closed sets, and a row that ends up with no real services (or a built-in-colliding /
 * malformed id) is dropped entirely — the owner store can never receive a campaign that
 * would not register.
 *
 * Server-side only (needs SUPABASE_SERVICE_ROLE_KEY at call time); never import from a
 * client component. Not marked 'server-only' so CI harnesses can exercise coercion.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import {
  DB_CADENCES, DB_CARD_TYPES, DB_SHELVES, DB_STAGES,
  isBuiltinCampaignId, isValidCampaignSlug,
  type DbCadence, type DbCampaign, type DbCardType, type DbShelf,
} from './data/db-campaigns'
import type { FunnelStage } from './data/create-catalog'
import { serviceById } from './catalog'

/** The raw catalog_campaigns row shape (content columns nullable; arrays may be null). */
export interface CatalogCampaignRow {
  id: string
  title: string | null
  tagline: string | null
  description: string | null
  promise: string | null
  why: string | null
  expectation: string | null
  hero_image: string | null
  best_for: string | null
  faq: unknown
  type: string | null
  cad: string | null
  stages: string[] | null
  shelf: string | null
  service_ids: string[] | null
  addon_service_ids: string[] | null
  status: string | null
  created_at?: string | null
  updated_at?: string | null
  updated_by?: string | null
}

const text = (v: string | null | undefined): string => (typeof v === 'string' ? v.trim() : '')
const oneOf = <T extends string>(v: string | null | undefined, allowed: readonly T[], fallback: T): T =>
  allowed.includes((v ?? '') as T) ? ((v ?? '') as T) : fallback

function coerceFaq(v: unknown): { q: string; a: string }[] {
  if (!Array.isArray(v)) return []
  return (v as { q?: unknown; a?: unknown }[])
    .filter((f) => f && typeof f.q === 'string' && f.q.trim() && typeof f.a === 'string' && f.a.trim())
    .map((f) => ({ q: (f.q as string).trim(), a: (f.a as string).trim() }))
}

/** snake_case row → DbCampaign. Null when the row could never render honestly
 *  (bad/colliding id, no title, or no real services after validation). */
export function rowToDbCampaign(row: CatalogCampaignRow): DbCampaign | null {
  if (typeof row?.id !== 'string' || !isValidCampaignSlug(row.id) || isBuiltinCampaignId(row.id)) return null
  const title = text(row.title)
  if (!title) return null
  const serviceIds = (Array.isArray(row.service_ids) ? row.service_ids : []).filter((id) => typeof id === 'string' && !!serviceById(id))
  if (!serviceIds.length) return null
  const addonServiceIds = (Array.isArray(row.addon_service_ids) ? row.addon_service_ids : []).filter((id) => typeof id === 'string' && !!serviceById(id))
  const stages = (Array.isArray(row.stages) ? row.stages : []).filter((s): s is FunnelStage => (DB_STAGES as readonly string[]).includes(s))
  const faq = coerceFaq(row.faq)
  const bestFor = text(row.best_for)
  return {
    id: row.id,
    title,
    tagline: text(row.tagline),
    description: text(row.description),
    promise: text(row.promise),
    why: text(row.why),
    expectation: text(row.expectation),
    heroImage: text(row.hero_image) || null,
    ...(bestFor ? { bestFor } : {}),
    ...(faq.length ? { faq } : {}),
    type: oneOf<DbCardType>(row.type, DB_CARD_TYPES, 'task'),
    cad: oneOf<DbCadence>(row.cad, DB_CADENCES, 'once'),
    shelf: oneOf<DbShelf>(row.shelf, DB_SHELVES, 'aware'),
    stages,
    serviceIds,
    addonServiceIds,
    status: row.status === 'live' ? 'live' : 'draft',
  }
}

/** The owner-facing read: LIVE campaigns only, coerced + honest, [] on ANY failure
 *  (missing table, missing env, network) — never throws. */
export async function getDbCampaigns(): Promise<DbCampaign[]> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.from('catalog_campaigns').select('*').eq('status', 'live')
    if (error || !data) return []
    return (data as CatalogCampaignRow[]).map(rowToDbCampaign).filter((c): c is DbCampaign => !!c)
  } catch {
    return []
  }
}

/** The admin read: EVERY row (drafts included), newest first, [] on any failure.
 *  Rows that fail coercion are dropped the same way, so the CMS list mirrors what
 *  the store could actually show. */
export async function getAllDbCampaigns(): Promise<DbCampaign[]> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.from('catalog_campaigns').select('*').order('created_at', { ascending: false })
    if (error || !data) return []
    return (data as CatalogCampaignRow[]).map(rowToDbCampaign).filter((c): c is DbCampaign => !!c)
  } catch {
    return []
  }
}
