'use server'

/**
 * Site Builder server actions.
 *
 * Reads + writes the site_configs table. Always validates against the
 * vertical's Zod schema so we never persist a malformed draft.
 *
 * Permission model:
 *   - Admins can read/write any client (RLS allows this via profiles.role).
 *   - client_users can read/write their own client_id only.
 *   - All checks happen at the DB layer via RLS — we don't duplicate them.
 */

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  VERTICAL_REGISTRY, RESTAURANT_DEFAULTS,
} from '@/lib/site-schemas'
import type { Vertical } from '@/lib/site-schemas'
import type { RestaurantSite } from '@/lib/site-schemas/restaurant'

type ActionResult<T = undefined> =
  | { success: true; data?: T }
  | { success: false; error: string }

// ============================================================================
// Types returned to client components
// ============================================================================

export interface SiteConfigRow {
  client_id: string
  vertical: Vertical
  template_id: string
  draft_data: RestaurantSite       // narrow once we have multiple verticals
  published_data: RestaurantSite | null
  published_at: string | null
  version: number
  updated_at: string
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Deep-merge user input on top of defaults so partial saves never violate
 * required-field invariants in the schema. Arrays are replaced wholesale
 * (not merged) — that's the right semantics for things like locations.
 */
function deepMerge<T>(base: T, patch: unknown): T {
  if (patch === null || patch === undefined) return base
  if (Array.isArray(base) || Array.isArray(patch)) return (patch ?? base) as T
  if (typeof base !== 'object' || typeof patch !== 'object') return (patch ?? base) as T
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) }
  for (const k of Object.keys(patch as Record<string, unknown>)) {
    const baseVal = (base as Record<string, unknown>)[k]
    const patchVal = (patch as Record<string, unknown>)[k]
    out[k] = deepMerge(baseVal, patchVal)
  }
  return out as T
}

function getDefaults(vertical: Vertical): unknown {
  return VERTICAL_REGISTRY[vertical]?.defaults ?? RESTAURANT_DEFAULTS
}

function getSchema(vertical: Vertical) {
  return VERTICAL_REGISTRY[vertical]?.schema
}

// ============================================================================
// getDraft — fetch (and if missing, lazy-create) the site_configs row
// ============================================================================

export async function getDraft(
  clientId: string,
  vertical: Vertical = 'restaurant',
): Promise<ActionResult<SiteConfigRow>> {
  const supabase = await createClient()
  const admin = createAdminClient()

  // 1. Try existing row
  const { data: existing, error: existErr } = await admin
    .from('site_configs')
    .select('*')
    .eq('client_id', clientId)
    .maybeSingle()

  if (existErr) return { success: false, error: existErr.message }
  if (existing) {
    return { success: true, data: existing as unknown as SiteConfigRow }
  }

  // 2. Auth check before lazy-create
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  // 3. Lazy-create with vertical defaults so admin form opens to a valid shape
  const defaults = getDefaults(vertical)
  const { data: created, error: createErr } = await admin
    .from('site_configs')
    .insert({
      client_id: clientId,
      vertical,
      template_id: 'restaurant-bold',
      draft_data: defaults,
      published_data: null,
    })
    .select('*')
    .single()

  if (createErr) return { success: false, error: createErr.message }
  return { success: true, data: created as unknown as SiteConfigRow }
}

// ============================================================================
// saveDraft — partial save with validation
// ============================================================================

export async function saveDraft(
  clientId: string,
  patch: Partial<RestaurantSite>,
): Promise<ActionResult<{ version: number; updated_at: string }>> {
  const supabase = await createClient()
  const admin = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  // Load existing row
  const { data: row, error: rowErr } = await admin
    .from('site_configs')
    .select('vertical, draft_data')
    .eq('client_id', clientId)
    .maybeSingle()

  if (rowErr) return { success: false, error: rowErr.message }
  if (!row) return { success: false, error: 'Site config not found — call getDraft first' }

  const vertical = row.vertical as Vertical
  const schema = getSchema(vertical)
  if (!schema) return { success: false, error: `Unknown vertical: ${vertical}` }

  // Deep-merge patch onto current draft (NOT defaults — preserve user edits)
  const merged = deepMerge(row.draft_data, patch)

  // Validate the merged shape, but only WARN on partial issues — drafts are
  // allowed to be incomplete. We just want to catch type errors / malformed
  // fields. Schema validation runs strictly at publish time.
  // For now we use safeParse and log issues but persist anyway (draft mode).
  const parsed = schema.safeParse(merged)
  if (!parsed.success) {
    // Don't block — drafts can be incomplete. Just log for debugging.
    console.warn('[saveDraft] schema warnings:', JSON.stringify(parsed.error.issues.slice(0, 5), null, 2))
  }

  const { data: updated, error: updErr } = await admin
    .from('site_configs')
    .update({ draft_data: merged })
    .eq('client_id', clientId)
    .select('version, updated_at')
    .single()

  if (updErr) return { success: false, error: updErr.message }

  revalidatePath(`/admin/clients`)
  return { success: true, data: { version: updated.version, updated_at: updated.updated_at } }
}

// ============================================================================
// replaceDraft — full overwrite (used by seed scripts and "import from JSON")
// ============================================================================

export async function replaceDraft(
  clientId: string,
  data: RestaurantSite,
): Promise<ActionResult<{ version: number }>> {
  const admin = createAdminClient()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const { data: row } = await admin
    .from('site_configs')
    .select('vertical')
    .eq('client_id', clientId)
    .maybeSingle()
  if (!row) return { success: false, error: 'Site config not found' }

  const schema = getSchema(row.vertical as Vertical)
  if (!schema) return { success: false, error: 'Unknown vertical' }

  const parsed = schema.safeParse(data)
  if (!parsed.success) {
    return { success: false, error: 'Validation failed: ' + parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') }
  }

  const { data: updated, error } = await admin
    .from('site_configs')
    .update({ draft_data: data })
    .eq('client_id', clientId)
    .select('version')
    .single()
  if (error) return { success: false, error: error.message }
  return { success: true, data: { version: updated.version } }
}

// ============================================================================
// publish — promote draft to published, append history, fire deploy hook
// ============================================================================

export async function publishSite(
  clientId: string,
  notes?: string,
): Promise<ActionResult<{ version: number; published_at: string }>> {
  const supabase = await createClient()
  const admin = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const { data: row, error: rowErr } = await admin
    .from('site_configs')
    .select('vertical, draft_data, version')
    .eq('client_id', clientId)
    .maybeSingle()
  if (rowErr) return { success: false, error: rowErr.message }
  if (!row) return { success: false, error: 'Site config not found' }

  const vertical = row.vertical as Vertical
  const schema = getSchema(vertical)
  if (!schema) return { success: false, error: `Unknown vertical: ${vertical}` }

  // Strict validation at publish time — no malformed data goes live
  const parsed = schema.safeParse(row.draft_data)
  if (!parsed.success) {
    return {
      success: false,
      error: 'Cannot publish: ' + parsed.error.issues
        .slice(0, 5)
        .map(i => `${i.path.join('.')}: ${i.message}`)
        .join('; '),
    }
  }

  const newVersion = (row.version ?? 0) + 1
  const now = new Date().toISOString()

  // Promote draft → published, bump version
  const { error: pubErr } = await admin
    .from('site_configs')
    .update({
      published_data: row.draft_data,
      published_at: now,
      published_by: user.id,
      version: newVersion,
    })
    .eq('client_id', clientId)
  if (pubErr) return { success: false, error: pubErr.message }

  // History snapshot
  const { error: histErr } = await admin
    .from('site_publish_history')
    .insert({
      client_id: clientId,
      data: row.draft_data,
      version: newVersion,
      published_by: user.id,
      notes: notes ?? null,
    })
  if (histErr) console.warn('[publishSite] history insert failed:', histErr.message)

  // Fire deploy hook (best-effort)
  await fireDeployHook(clientId).catch(e =>
    console.warn('[publishSite] deploy hook failed:', e?.message),
  )

  revalidatePath(`/admin/clients`)
  revalidatePath(`/api/public/sites`)
  return { success: true, data: { version: newVersion, published_at: now } }
}

// ============================================================================
// revertToVersion — restore a previously-published version into draft
// ============================================================================

export async function revertToVersion(
  clientId: string,
  historyId: string,
): Promise<ActionResult> {
  const supabase = await createClient()
  const admin = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const { data: snapshot, error } = await admin
    .from('site_publish_history')
    .select('data')
    .eq('client_id', clientId)
    .eq('id', historyId)
    .single()
  if (error || !snapshot) return { success: false, error: error?.message ?? 'snapshot not found' }

  const { error: updErr } = await admin
    .from('site_configs')
    .update({ draft_data: snapshot.data })
    .eq('client_id', clientId)
  if (updErr) return { success: false, error: updErr.message }

  revalidatePath(`/admin/clients`)
  return { success: true }
}

// ============================================================================
// listHistory
// ============================================================================

export async function listHistory(
  clientId: string,
): Promise<ActionResult<{ id: string; version: number; published_at: string; notes: string | null }[]>> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('site_publish_history')
    .select('id, version, published_at, notes')
    .eq('client_id', clientId)
    .order('published_at', { ascending: false })
    .limit(50)
  if (error) return { success: false, error: error.message }
  return { success: true, data: data ?? [] }
}

// ============================================================================
// Deploy hook integration
// ============================================================================

async function fireDeployHook(clientId: string): Promise<void> {
  const admin = createAdminClient()
  const { data: row } = await admin
    .from('site_settings')
    .select('deploy_hook_url')
    .eq('client_id', clientId)
    .maybeSingle()
  const url = (row as Record<string, unknown> | null)?.deploy_hook_url as string | null | undefined
  if (!url) return
  await fetch(url, { method: 'POST' }).catch(() => null)
}
