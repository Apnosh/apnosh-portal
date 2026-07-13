'use server'
/**
 * Admin catalog edit actions. Writes go through the admin's own session (cookie-bound client) and
 * are gated by the catalog_services RLS policy (admin writes) — no service-role key needed. Publish
 * regenerates the frozen snapshot the pure/sync composer reads, so edits go live in plans.
 */
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { rowToService, renderGeneratedSnapshot, type CatalogRow } from '@/lib/campaigns/data/catalog-db-shape'
import type { GoalPlay, PricePoint, CardLane } from '@/lib/campaigns/data/priced-catalog'
import * as fs from 'fs'
import * as path from 'path'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: 'Not authenticated' }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if ((profile?.role as string | null) !== 'admin') return { ok: false as const, error: 'Admin access required' }
  return { ok: true as const, userId: user.id, supabase }
}

export interface ServicePatch {
  name?: string
  plain_name?: string | null
  description?: string
  status?: 'active' | 'draft' | 'archived' | 'coming_soon'
  section?: string
  handler?: string
  handler_why?: string
  essential?: boolean
  prices?: unknown // PricePoint[]
  deliverables?: { summary: string; included: string[] } | null
  goal_plays?: GoalPlay[] | null // which campaigns/goals this item belongs to (the plan recipe)
  lanes?: CardLane[] | null // per-card delivery lanes (Fiverr-style)
}

const SERVICE_FIELDS = ['name', 'plain_name', 'description', 'status', 'section', 'handler', 'handler_why', 'essential', 'prices', 'deliverables', 'goal_plays', 'lanes'] as const

/** A brand-new catalog card, authored from scratch in the admin builder. */
export interface NewService {
  id: string
  section: string
  name: string
  plain_name: string | null
  description: string
  handler: string
  handler_why: string
  essential: boolean
  prices: PricePoint[]
  deliverables: { summary: string; included: string[] } | null
  goal_plays: GoalPlay[] | null
  lanes: CardLane[] | null
  status: 'active' | 'draft' | 'archived' | 'coming_soon'
}

const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Create a new catalog card. Validates a unique, url-safe id and at least one price. */
export async function createService(row: NewService): Promise<{ ok: boolean; error?: string; id?: string }> {
  const a = await requireAdmin()
  if (!a.ok) return { ok: false, error: a.error }
  const id = row.id.trim().toLowerCase()
  if (!ID_RE.test(id)) return { ok: false, error: 'ID must be lowercase words joined by dashes (e.g. "menu-refresh").' }
  if (!row.name.trim()) return { ok: false, error: 'A name is required.' }
  if (!Array.isArray(row.prices) || row.prices.length === 0) return { ok: false, error: 'Add at least one price.' }

  const { data: existing } = await a.supabase.from('catalog_services').select('id').eq('id', id).maybeSingle()
  if (existing) return { ok: false, error: `A card with id "${id}" already exists.` }

  // put new cards at the end of their section by default
  const { data: maxRow } = await a.supabase.from('catalog_services').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle()
  const sortOrder = ((maxRow?.sort_order as number | undefined) ?? 0) + 10

  const insert = {
    id,
    section: row.section,
    name: row.name.trim(),
    plain_name: row.plain_name?.trim() || null,
    description: row.description.trim(),
    essential: row.essential,
    handler: row.handler,
    handler_why: row.handler_why.trim(),
    prices: row.prices,
    goal_plays: row.goal_plays,
    deliverables: row.deliverables,
    lanes: row.lanes,
    status: row.status,
    sort_order: sortOrder,
    updated_at: new Date().toISOString(),
    updated_by: a.userId,
  }
  const { error } = await a.supabase.from('catalog_services').insert(insert)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/catalog')
  return { ok: true, id }
}

/** Save edits to one service. Returns ok or a plain error. */
export async function updateService(id: string, patch: ServicePatch): Promise<{ ok: boolean; error?: string }> {
  const a = await requireAdmin()
  if (!a.ok) return { ok: false, error: a.error }
  const fields: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: a.userId }
  for (const k of SERVICE_FIELDS) {
    if (k in patch) fields[k] = (patch as Record<string, unknown>)[k]
  }
  const { error } = await a.supabase.from('catalog_services').update(fields).eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/catalog')
  return { ok: true }
}

/** Delete a card. Refuses if it's referenced by any campaign line — archive it instead so live
 *  and past campaigns keep resolving. */
export async function deleteService(id: string): Promise<{ ok: boolean; error?: string }> {
  const a = await requireAdmin()
  if (!a.ok) return { ok: false, error: a.error }
  const { count, error: cErr } = await a.supabase
    .from('campaign_line_items').select('id', { count: 'exact', head: true }).eq('service_id', id)
  if (cErr) return { ok: false, error: cErr.message }
  if ((count ?? 0) > 0) return { ok: false, error: `This card is used in ${count} campaign line${count === 1 ? '' : 's'}. Set it to Archived instead of deleting.` }
  const { error } = await a.supabase.from('catalog_services').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/catalog')
  return { ok: true }
}

/** Publish: regenerate catalog.generated.ts from the live ACTIVE rows so edits reach the plan
 *  builder. Writes the snapshot file (dev: HMR picks it up; prod: a deploy ships it). */
export async function publishCatalog(): Promise<{ ok: boolean; error?: string; count?: number }> {
  const a = await requireAdmin()
  if (!a.ok) return { ok: false, error: a.error }
  const { data, error } = await a.supabase
    .from('catalog_services').select('*').eq('status', 'active').order('sort_order', { ascending: true })
  if (error) return { ok: false, error: error.message }
  const services = (data as CatalogRow[]).map(rowToService)
  if (!services.length) return { ok: false, error: 'No active services to publish' }
  try {
    fs.writeFileSync(path.join(process.cwd(), 'src/lib/campaigns/data/catalog.generated.ts'), renderGeneratedSnapshot(services))
  } catch (e) {
    return { ok: false, error: 'Saved to the database, but writing the snapshot failed: ' + (e instanceof Error ? e.message : String(e)) }
  }
  revalidatePath('/admin/catalog')
  return { ok: true, count: services.length }
}
