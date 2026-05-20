'use server'

/**
 * Admin actions for managing a vendor's profile + portfolio.
 */

import { revalidatePath } from 'next/cache'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const BUCKET = 'vendor-portfolio'

async function requireAdmin() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: 'Not authenticated' }
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle() as { data: { role: string } | null }
  if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
    return { ok: false as const, error: 'Admin only' }
  }
  return { ok: true as const, userId: user.id }
}

/**
 * Upload a portfolio image. Accepts a base64 data URL (image/jpeg or
 * image/png), uploads to Supabase Storage, inserts a portfolio row.
 */
export async function uploadPortfolioItem({
  vendorSlug,
  dataUrl,
  caption,
  category,
  featured,
}: {
  vendorSlug: string
  dataUrl: string
  caption?: string
  category?: string
  featured?: boolean
}): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireAdmin()
  if (!auth.ok) return { ok: false, error: auth.error }
  const admin = createAdminClient()

  const { data: vendor } = await admin
    .from('vendors')
    .select('id')
    .eq('slug', vendorSlug)
    .maybeSingle() as { data: { id: string } | null }
  if (!vendor) return { ok: false, error: 'Vendor not found' }

  /* Decode base64 data URL. */
  const match = dataUrl.match(/^data:(image\/[a-z+]+);base64,(.+)$/i)
  if (!match) return { ok: false, error: 'Invalid image data' }
  const mimeType = match[1]
  const ext = mimeType.split('/')[1].replace('jpeg', 'jpg')
  const buffer = Buffer.from(match[2], 'base64')
  if (buffer.length > 10 * 1024 * 1024) {
    return { ok: false, error: 'Image too large (max 10MB)' }
  }

  const filename = `${vendorSlug}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { error: uploadErr } = await admin.storage
    .from(BUCKET)
    .upload(filename, buffer, { contentType: mimeType, cacheControl: '31536000' })
  if (uploadErr) return { ok: false, error: uploadErr.message }

  const { error: insertErr } = await admin.from('vendor_portfolio_items').insert({
    vendor_id: vendor.id,
    storage_path: filename,
    caption: caption?.trim() || null,
    category: category || null,
    featured: featured ?? false,
  })
  if (insertErr) return { ok: false, error: insertErr.message }

  revalidatePath(`/admin/vendors/${vendorSlug}`)
  revalidatePath(`/marketplace/${vendorSlug}`)
  revalidatePath('/dashboard/marketplace')
  return { ok: true }
}

export async function deletePortfolioItem({
  itemId,
  vendorSlug,
}: { itemId: string; vendorSlug: string }): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireAdmin()
  if (!auth.ok) return { ok: false, error: auth.error }
  const admin = createAdminClient()

  const { data: item } = await admin
    .from('vendor_portfolio_items')
    .select('storage_path, thumbnail_path')
    .eq('id', itemId)
    .maybeSingle() as { data: { storage_path: string; thumbnail_path: string | null } | null }
  if (!item) return { ok: false, error: 'Not found' }

  await admin.storage.from(BUCKET).remove([item.storage_path])
  if (item.thumbnail_path) await admin.storage.from(BUCKET).remove([item.thumbnail_path])
  await admin.from('vendor_portfolio_items').delete().eq('id', itemId)

  revalidatePath(`/admin/vendors/${vendorSlug}`)
  revalidatePath(`/marketplace/${vendorSlug}`)
  revalidatePath('/dashboard/marketplace')
  return { ok: true }
}

export async function toggleFeatured({
  itemId,
  vendorSlug,
  featured,
}: { itemId: string; vendorSlug: string; featured: boolean }): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireAdmin()
  if (!auth.ok) return { ok: false, error: auth.error }
  const admin = createAdminClient()

  const { error } = await admin
    .from('vendor_portfolio_items')
    .update({ featured })
    .eq('id', itemId)
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/admin/vendors/${vendorSlug}`)
  revalidatePath(`/marketplace/${vendorSlug}`)
  revalidatePath('/dashboard/marketplace')
  return { ok: true }
}
