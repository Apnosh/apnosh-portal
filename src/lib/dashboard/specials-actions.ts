'use server'

/**
 * Daily specials / deals management for client-side.
 *
 * Specials are recurring time-windowed combo deals (e.g. "Happy Hour
 * 3-5pm") shown on the customer's site. Distinct from one-off promos
 * with codes/expiry (those go through client_updates).
 *
 * Permission model mirrors menu-actions: any client_user CRUDs their
 * own; admins CRUD any. After every write we fire the deploy hook so
 * the site rebuilds within ~30s.
 */

import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient, SupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminDb = SupabaseClient<any, 'public', any>

function adminDb(): AdminDb {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  ) as AdminDb
}

async function requireClientUser(): Promise<
  | { ok: true; userId: string; clientId: string }
  | { ok: false; error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }
  const db = adminDb()
  const { data: cu } = await db
    .from('client_users')
    .select('client_id')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!cu?.client_id) return { ok: false, error: 'No client account' }
  return { ok: true, userId: user.id, clientId: cu.client_id as string }
}

// ─── Types ─────────────────────────────────────────────────────────

export interface Special {
  id: string
  title: string
  tagline: string | null
  timeWindow: string | null
  price: string | null
  saveLabel: string | null
  includes: string[]
  photoUrl: string | null
  displayOrder: number
  isActive: boolean
  availableLocationIds: string[]
  updatedAt: string
}

export interface SpecialInput {
  title: string
  tagline?: string | null
  timeWindow?: string | null
  price?: string | null
  saveLabel?: string | null
  includes?: string[]
  photoUrl?: string | null
  displayOrder?: number
  isActive?: boolean
  availableLocationIds?: string[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToSpecial(r: any): Special {
  return {
    id: r.id as string,
    title: r.title as string,
    tagline: (r.tagline as string | null) ?? null,
    timeWindow: (r.time_window as string | null) ?? null,
    price: (r.price as string | null) ?? null,
    saveLabel: (r.save_label as string | null) ?? null,
    includes: (r.includes as string[]) ?? [],
    photoUrl: (r.photo_url as string | null) ?? null,
    displayOrder: (r.display_order as number) ?? 0,
    isActive: (r.is_active as boolean) ?? true,
    availableLocationIds: (r.available_location_ids as string[]) ?? [],
    updatedAt: r.updated_at as string,
  }
}

// ─── Read ──────────────────────────────────────────────────────────

export async function listMySpecials(): Promise<
  { success: true; data: Special[] } | { success: false; error: string }
> {
  const auth = await requireClientUser()
  if (!auth.ok) return { success: false, error: auth.error }
  const db = adminDb()
  const { data, error } = await db
    .from('client_specials')
    .select('*')
    .eq('client_id', auth.clientId)
    .order('display_order', { ascending: true })
    .order('title', { ascending: true })
  if (error) return { success: false, error: error.message }
  return { success: true, data: (data ?? []).map(rowToSpecial) }
}

// ─── Write ─────────────────────────────────────────────────────────

function validate(input: SpecialInput): string | null {
  if (!input.title?.trim()) return 'Title is required'
  return null
}

async function fireDeployHook(clientId: string) {
  const db = adminDb()
  const { data: settings } = await db
    .from('site_settings')
    .select('site_type, external_deploy_hook_url, is_published')
    .eq('client_id', clientId)
    .maybeSingle()
  if (
    settings?.site_type === 'external_repo' &&
    settings?.external_deploy_hook_url &&
    settings?.is_published
  ) {
    try {
      await fetch(settings.external_deploy_hook_url as string, { method: 'POST' })
    } catch {
      // non-fatal
    }
  }
}

export async function createMySpecial(input: SpecialInput): Promise<
  { success: true; data: Special } | { success: false; error: string }
> {
  const auth = await requireClientUser()
  if (!auth.ok) return { success: false, error: auth.error }
  const err = validate(input)
  if (err) return { success: false, error: err }

  const db = adminDb()
  const { data, error } = await db
    .from('client_specials')
    .insert({
      client_id: auth.clientId,
      title: input.title.trim(),
      tagline: input.tagline?.trim() || null,
      time_window: input.timeWindow?.trim() || null,
      price: input.price?.trim() || null,
      save_label: input.saveLabel?.trim() || null,
      includes: (input.includes ?? []).map(s => s.trim()).filter(Boolean),
      photo_url: input.photoUrl?.trim() || null,
      display_order: input.displayOrder ?? 0,
      is_active: input.isActive ?? true,
      available_location_ids: input.availableLocationIds ?? [],
      last_edited_by: auth.userId,
    })
    .select('*')
    .single()
  if (error || !data) return { success: false, error: error?.message ?? 'Insert failed' }

  await fireDeployHook(auth.clientId)
  revalidatePath('/dashboard/website/manage')
  return { success: true, data: rowToSpecial(data) }
}

export async function updateMySpecial(
  id: string,
  patch: Partial<SpecialInput>,
): Promise<{ success: true; data: Special } | { success: false; error: string }> {
  const auth = await requireClientUser()
  if (!auth.ok) return { success: false, error: auth.error }

  const db = adminDb()
  const { data: existing } = await db
    .from('client_specials').select('client_id').eq('id', id).maybeSingle()
  if (!existing || existing.client_id !== auth.clientId) {
    return { success: false, error: 'Special not found' }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update: Record<string, any> = { last_edited_by: auth.userId }
  if (patch.title !== undefined) update.title = patch.title.trim()
  if (patch.tagline !== undefined) update.tagline = patch.tagline?.trim() || null
  if (patch.timeWindow !== undefined) update.time_window = patch.timeWindow?.trim() || null
  if (patch.price !== undefined) update.price = patch.price?.trim() || null
  if (patch.saveLabel !== undefined) update.save_label = patch.saveLabel?.trim() || null
  if (patch.includes !== undefined) update.includes = patch.includes.map(s => s.trim()).filter(Boolean)
  if (patch.photoUrl !== undefined) update.photo_url = patch.photoUrl?.trim() || null
  if (patch.displayOrder !== undefined) update.display_order = patch.displayOrder
  if (patch.isActive !== undefined) update.is_active = patch.isActive
  if (patch.availableLocationIds !== undefined) update.available_location_ids = patch.availableLocationIds

  const { data, error } = await db
    .from('client_specials').update(update).eq('id', id).select('*').single()
  if (error || !data) return { success: false, error: error?.message ?? 'Update failed' }

  await fireDeployHook(auth.clientId)
  revalidatePath('/dashboard/website/manage')
  return { success: true, data: rowToSpecial(data) }
}

export async function deleteMySpecial(id: string): Promise<
  { success: true } | { success: false; error: string }
> {
  const auth = await requireClientUser()
  if (!auth.ok) return { success: false, error: auth.error }
  const db = adminDb()
  const { data: existing } = await db
    .from('client_specials').select('client_id').eq('id', id).maybeSingle()
  if (!existing || existing.client_id !== auth.clientId) {
    return { success: false, error: 'Special not found' }
  }
  const { error } = await db.from('client_specials').delete().eq('id', id)
  if (error) return { success: false, error: error.message }

  await fireDeployHook(auth.clientId)
  revalidatePath('/dashboard/website/manage')
  return { success: true }
}
