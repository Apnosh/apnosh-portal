'use server'

/**
 * Server actions for a creator managing their OWN storefront: the packages they publish, at
 * their own price, with their own options. This is the seller side of the creative marketplace.
 *
 * Identity is derived from the session, never from the client. A creator is the `vendors` row
 * whose `person_id` equals the logged-in auth user (the link an admin sets with linkVendorLogin,
 * migration 146). Every write is scoped to that vendor id, computed here, so a creator can only
 * ever touch their own listings even if they forge an id in the request. Writes go through the
 * admin client after that ownership check, matching how the rest of the app mutates.
 *
 * No money moves here and nothing a creator sets reaches a client's bill yet: publishing a
 * package makes it visible on their storefront, that is all. Checkout and payouts are later,
 * deliberately, so this surface carries no financial risk while the shelf fills up.
 */

import { revalidatePath } from 'next/cache'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  validatePackage, packageToRow, rowToPackage,
  type CreatorPackage, type ListingRow,
} from './package'

export interface MyStore {
  vendor: { id: string; name: string; slug: string; craft: string | null; bookable: boolean } | null
  packages: CreatorPackage[]
}

/** The logged-in creator's vendor id, or null when the caller is not a linked creator. The one
 *  place identity is resolved, so every action below trusts the same answer. `bookable` tells the
 *  editor whether they're live in the store yet (self-serve creators start pending an admin review). */
async function myVendorId(): Promise<{ id: string; name: string; slug: string; craft: string | null; bookable: boolean } | null> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const admin = createAdminClient()
  const { data } = await admin
    .from('vendors')
    .select('id, name, slug, craft, bookable')
    .eq('person_id', user.id)
    .maybeSingle()
  return data ? { id: data.id, name: data.name, slug: data.slug, craft: (data.craft as string | null) ?? null, bookable: data.bookable !== false } : null
}

/** Everything the storefront editor needs on load: who the creator is, and their packages. */
export async function getMyStore(): Promise<MyStore> {
  const vendor = await myVendorId()
  if (!vendor) return { vendor: null, packages: [] }

  const admin = createAdminClient()
  const { data } = await admin
    .from('vendor_listings')
    .select('id, vendor_id, slug, title, category, listing_type, description, price_cents, billing_period, details, active')
    .eq('vendor_id', vendor.id)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true })

  const packages = (data ?? []).map((r) => rowToPackage(r as ListingRow))
  return { vendor, packages }
}

/** Create or update one package, always under the caller's own vendor. Returns the saved package
 *  (with its id) or the plain problems that stopped it. */
export async function saveMyPackage(input: CreatorPackage): Promise<{ ok: true; pkg: CreatorPackage } | { ok: false; errors: string[] }> {
  const vendor = await myVendorId()
  if (!vendor) return { ok: false, errors: ['You are not set up as a creator yet.'] }

  const errors = validatePackage(input)
  if (errors.length) return { ok: false, errors }

  const admin = createAdminClient()

  // An edit must target a row that is genuinely this creator's. Re-read and compare rather than
  // trusting the id in the request, so a forged id cannot reach across to another vendor.
  if (input.id) {
    const { data: owned } = await admin.from('vendor_listings').select('id').eq('id', input.id).eq('vendor_id', vendor.id).maybeSingle()
    if (!owned) return { ok: false, errors: ['That package is not yours to edit.'] }
  }

  const row = packageToRow(input, vendor.id)
  const { data, error } = await admin
    .from('vendor_listings')
    .upsert(row, { onConflict: 'vendor_id,slug' })
    .select('id, vendor_id, slug, title, category, listing_type, description, price_cents, billing_period, details, active')
    .maybeSingle()

  if (error || !data) return { ok: false, errors: ['That did not save. Try again.'] }
  revalidatePath('/creator/storefront')
  return { ok: true, pkg: rowToPackage(data as ListingRow) }
}

/** Publish or unpublish a package (active flag). Unpublished packages stay in the editor but drop
 *  off the public storefront. Scoped to the caller's vendor. */
export async function setPackagePublished(id: string, active: boolean): Promise<{ ok: boolean }> {
  const vendor = await myVendorId()
  if (!vendor) return { ok: false }
  const admin = createAdminClient()
  const { error } = await admin.from('vendor_listings').update({ active, updated_at: new Date().toISOString() }).eq('id', id).eq('vendor_id', vendor.id)
  if (error) return { ok: false }
  revalidatePath('/creator/storefront')
  return { ok: true }
}

/** Delete a package. Scoped to the caller's vendor, so no cross-vendor delete is possible. */
export async function deleteMyPackage(id: string): Promise<{ ok: boolean }> {
  const vendor = await myVendorId()
  if (!vendor) return { ok: false }
  const admin = createAdminClient()
  const { error } = await admin.from('vendor_listings').delete().eq('id', id).eq('vendor_id', vendor.id)
  if (error) return { ok: false }
  revalidatePath('/creator/storefront')
  return { ok: true }
}
