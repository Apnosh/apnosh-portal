'use server'

/**
 * Menu management for client-side.
 *
 * Replaces the pattern of menu items being baked into customer site
 * templates (e.g. Yellow Bee's _data/menu.json). Now items live in
 * the menu_items table; the customer site renders from the public API.
 *
 * Permission model:
 *   - Owner / manager (any client_user) can CRUD their own menu items
 *   - Admin can CRUD any client's menu items
 *   - Hard constraints: name required, category required
 *
 * After every write we POST the customer site's deploy hook so the new
 * menu shows up live within ~30 seconds.
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

export type MenuItemKind = 'item' | 'modifier'

export interface MenuItem {
  id: string
  category: string
  kind: MenuItemKind
  name: string
  description: string | null
  priceCents: number | null
  photoUrl: string | null
  displayOrder: number
  isAvailable: boolean
  isFeatured: boolean
  availableLocationIds: string[]
  updatedAt: string
}

export interface MenuItemInput {
  category: string
  kind?: MenuItemKind
  name: string
  description?: string | null
  priceCents?: number | null
  photoUrl?: string | null
  displayOrder?: number
  isAvailable?: boolean
  isFeatured?: boolean
  availableLocationIds?: string[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToItem(r: any): MenuItem {
  return {
    id: r.id as string,
    category: r.category as string,
    kind: r.kind as MenuItemKind,
    name: r.name as string,
    description: (r.description as string | null) ?? null,
    priceCents: (r.price_cents as number | null) ?? null,
    photoUrl: (r.photo_url as string | null) ?? null,
    displayOrder: (r.display_order as number) ?? 0,
    isAvailable: (r.is_available as boolean) ?? true,
    isFeatured: (r.is_featured as boolean) ?? false,
    availableLocationIds: (r.available_location_ids as string[]) ?? [],
    updatedAt: r.updated_at as string,
  }
}

// ─── Read ──────────────────────────────────────────────────────────

export async function listMyMenuItems(): Promise<
  { success: true; data: MenuItem[] } | { success: false; error: string }
> {
  const auth = await requireClientUser()
  if (!auth.ok) return { success: false, error: auth.error }
  const db = adminDb()
  const { data, error } = await db
    .from('menu_items')
    .select('*')
    .eq('client_id', auth.clientId)
    .order('category', { ascending: true })
    .order('display_order', { ascending: true })
    .order('name', { ascending: true })
  if (error) return { success: false, error: error.message }
  return { success: true, data: (data ?? []).map(rowToItem) }
}

// ─── Write ─────────────────────────────────────────────────────────

function validate(input: MenuItemInput): string | null {
  if (!input.name?.trim()) return 'Name is required'
  if (!input.category?.trim()) return 'Category is required'
  if (input.priceCents !== null && input.priceCents !== undefined && input.priceCents < 0) {
    return 'Price cannot be negative'
  }
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
      // non-fatal; data is saved, deploy retry handled elsewhere
    }
  }
}

export async function createMyMenuItem(input: MenuItemInput): Promise<
  { success: true; data: MenuItem } | { success: false; error: string }
> {
  const auth = await requireClientUser()
  if (!auth.ok) return { success: false, error: auth.error }
  const err = validate(input)
  if (err) return { success: false, error: err }

  const db = adminDb()
  const { data, error } = await db
    .from('menu_items')
    .insert({
      client_id: auth.clientId,
      category: input.category.trim(),
      kind: input.kind ?? 'item',
      name: input.name.trim(),
      description: input.description?.trim() || null,
      price_cents: input.priceCents ?? null,
      photo_url: input.photoUrl?.trim() || null,
      display_order: input.displayOrder ?? 0,
      is_available: input.isAvailable ?? true,
      is_featured: input.isFeatured ?? false,
      available_location_ids: input.availableLocationIds ?? [],
      last_edited_by: auth.userId,
    })
    .select('*')
    .single()
  if (error || !data) return { success: false, error: error?.message ?? 'Insert failed' }

  await fireDeployHook(auth.clientId)
  revalidatePath('/dashboard/website/manage')
  return { success: true, data: rowToItem(data) }
}

export async function updateMyMenuItem(
  id: string,
  patch: Partial<MenuItemInput>,
): Promise<{ success: true; data: MenuItem } | { success: false; error: string }> {
  const auth = await requireClientUser()
  if (!auth.ok) return { success: false, error: auth.error }

  const db = adminDb()
  // Ensure the item belongs to this client (extra defense beyond RLS)
  const { data: existing } = await db
    .from('menu_items').select('client_id').eq('id', id).maybeSingle()
  if (!existing || existing.client_id !== auth.clientId) {
    return { success: false, error: 'Item not found' }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update: Record<string, any> = { last_edited_by: auth.userId }
  if (patch.category !== undefined) update.category = patch.category.trim()
  if (patch.kind !== undefined) update.kind = patch.kind
  if (patch.name !== undefined) update.name = patch.name.trim()
  if (patch.description !== undefined) update.description = patch.description?.trim() || null
  if (patch.priceCents !== undefined) update.price_cents = patch.priceCents
  if (patch.photoUrl !== undefined) update.photo_url = patch.photoUrl?.trim() || null
  if (patch.displayOrder !== undefined) update.display_order = patch.displayOrder
  if (patch.isAvailable !== undefined) update.is_available = patch.isAvailable
  if (patch.isFeatured !== undefined) update.is_featured = patch.isFeatured
  if (patch.availableLocationIds !== undefined) update.available_location_ids = patch.availableLocationIds

  const { data, error } = await db
    .from('menu_items').update(update).eq('id', id).select('*').single()
  if (error || !data) return { success: false, error: error?.message ?? 'Update failed' }

  await fireDeployHook(auth.clientId)
  revalidatePath('/dashboard/website/manage')
  return { success: true, data: rowToItem(data) }
}

export async function deleteMyMenuItem(id: string): Promise<
  { success: true } | { success: false; error: string }
> {
  const auth = await requireClientUser()
  if (!auth.ok) return { success: false, error: auth.error }
  const db = adminDb()
  const { data: existing } = await db
    .from('menu_items').select('client_id').eq('id', id).maybeSingle()
  if (!existing || existing.client_id !== auth.clientId) {
    return { success: false, error: 'Item not found' }
  }
  const { error } = await db.from('menu_items').delete().eq('id', id)
  if (error) return { success: false, error: error.message }

  await fireDeployHook(auth.clientId)
  revalidatePath('/dashboard/website/manage')
  return { success: true }
}
