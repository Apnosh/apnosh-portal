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

import { cache } from 'react'
import { revalidatePath } from 'next/cache'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  validatePackage, packageToRow, rowToPackage,
  type CreatorPackage, type ListingRow,
} from './package'
import { dispatchForSkills } from './creator-skills'
import type { CalendarItem } from './creator-schedule-types'
import { calendarForCreator } from './creator-calendar-data'

const US_STATES = new Set(['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC'])

export interface MyStore {
  vendor: { id: string; name: string; slug: string; craft: string | null; bookable: boolean } | null
  packages: CreatorPackage[]
}

/** The logged-in creator's vendor id, or null when the caller is not a linked creator. The one
 *  place identity is resolved, so every action below trusts the same answer. `bookable` tells the
 *  editor whether they're live in the store yet (self-serve creators start pending an admin review). */
const myVendorId = cache(async (): Promise<{ id: string; name: string; slug: string; craft: string | null; bookable: boolean } | null> => {
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
})

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

/* ── the creator's own PROFILE (name, bio, skills, area, style) — read + edit ─────────────── */

export interface MyProfile {
  id: string
  name: string
  slug: string
  bookable: boolean
  bio: string
  skills: string[]
  serviceArea: string[]
  styleTags: string[]
  portfolioLinks: string[]
}

/** The logged-in creator's editable profile fields, or null when they're not a creator. */
export async function getMyCreatorProfile(): Promise<MyProfile | null> {
  const vendor = await myVendorId()
  if (!vendor) return null
  const admin = createAdminClient()
  const { data } = await admin
    .from('vendors')
    .select('id, name, slug, bookable, description, crafts, service_area, style_tags, portfolio_links')
    .eq('id', vendor.id)
    .maybeSingle()
  if (!data) return null
  const arr = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : [])
  return {
    id: data.id as string,
    name: (data.name as string) ?? '',
    slug: (data.slug as string) ?? '',
    bookable: data.bookable !== false,
    bio: (data.description as string | null) ?? '',
    skills: arr(data.crafts),
    serviceArea: arr(data.service_area),
    styleTags: arr(data.style_tags),
    portfolioLinks: arr(data.portfolio_links),
  }
}

/** Update the creator's own profile. Scoped to their vendor; keeps the scalar `craft` (dispatch key)
 *  in sync with the primary skill so campaign routing stays correct. */
export async function updateMyProfile(input: { name: string; bio: string; skills: string[]; serviceArea: string[]; styleTags: string[]; portfolioLinks?: string[] }): Promise<{ ok: boolean; error?: string }> {
  const vendor = await myVendorId()
  if (!vendor) return { ok: false, error: 'You are not set up as a creator yet.' }
  const name = (input.name ?? '').trim()
  if (!name) return { ok: false, error: 'Add your name.' }
  const skills = (input.skills ?? []).filter(Boolean)
  if (!skills.length) return { ok: false, error: 'Pick at least one thing you do.' }
  const areas = (input.serviceArea ?? []).map((s) => s.trim().toUpperCase()).filter(Boolean)
  if (!areas.length) return { ok: false, error: 'Add where you work, like WA.' }
  const badArea = areas.find((a) => !US_STATES.has(a))
  if (badArea) return { ok: false, error: `"${badArea}" is not a state code. Use 2-letter codes like WA or OR.` }

  const admin = createAdminClient()
  const { error } = await admin.from('vendors').update({
    name,
    description: input.bio?.trim() || null,
    craft: dispatchForSkills(skills),
    crafts: skills,
    service_area: areas,
    style_tags: (input.styleTags ?? []).filter(Boolean),
    ...(input.portfolioLinks ? { portfolio_links: input.portfolioLinks.map((l) => l.trim()).filter(Boolean) } : {}),
    updated_at: new Date().toISOString(),
  }).eq('id', vendor.id)
  if (error) return { ok: false, error: 'Could not save. Try again.' }
  revalidatePath('/creator/account'); revalidatePath('/creator/account/profile'); revalidatePath(`/marketplace/${vendor.slug}`)
  return { ok: true }
}

/* ── the creator's MASTER CALENDAR — every dated thing in one place ──────────────────────── */

/** All the creator's active dated work: shoots (with a time) and deliverable deadlines (no time).
 *  Sourced from their work orders — every confirmed booking + campaign piece mints one — so a
 *  photographer-editor sees shoots on their day AND editing due-dates on the same calendar, without
 *  the two being on the same "set intervals". Shoot times come from the linked booking. */
export async function getMyCalendar(): Promise<CalendarItem[]> {
  const vendor = await myVendorId()
  if (!vendor) return []
  return calendarForCreator(vendor.id)
}
