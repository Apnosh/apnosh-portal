'use server'
/**
 * Admin catalog edit actions. Writes go through the admin's own session (cookie-bound client) and
 * are gated by the catalog_services RLS policy (admin writes) — no service-role key needed. Publish
 * regenerates the frozen snapshot the pure/sync composer reads, so edits go live in plans.
 */
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { rowToService, renderGeneratedSnapshot, type CatalogRow } from '@/lib/campaigns/data/catalog-db-shape'
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
  prices?: unknown // PricePoint[]
  deliverables?: { summary: string; included: string[] } | null
}

/** Save edits to one service. Returns ok or a plain error. */
export async function updateService(id: string, patch: ServicePatch): Promise<{ ok: boolean; error?: string }> {
  const a = await requireAdmin()
  if (!a.ok) return { ok: false, error: a.error }
  const fields: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: a.userId }
  for (const k of ['name', 'plain_name', 'description', 'status', 'prices', 'deliverables'] as const) {
    if (k in patch) fields[k] = (patch as Record<string, unknown>)[k]
  }
  const { error } = await a.supabase.from('catalog_services').update(fields).eq('id', id)
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
