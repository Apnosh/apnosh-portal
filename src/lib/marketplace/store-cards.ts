/**
 * CREATOR STORE CARDS — the creator packages that appear IN the campaigns store, so a restaurant
 * browsing the DoorDash-style store sees offerings from local creators next to Apnosh's own, not
 * on some separate page.
 *
 * Pure read + a light mapper. Each active creator package becomes one card the store can render
 * as an anchor to that creator's storefront. Priced through the shared package model, so a card's
 * number is exactly what the creator published. No checkout is implied: the card links to the
 * creator's page to view and request, until the payout rail and its legal sign-off land.
 *
 * "Creator" here means a real third-party vendor (individual or company), never Apnosh itself.
 * Apnosh's own bundles already have their place in the store as the built-in catalog.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { rowToPackage, startingPriceCents, maxPriceCents, formatCents, type ListingRow } from './package'

export interface CreatorStoreCard {
  /** Namespaced so it can never collide with a catalog/DB card id. */
  id: string
  vendorSlug: string
  vendorName: string
  listingSlug: string
  title: string
  category: string
  /** The store shelf this belongs on. Today everything creators sell is content. */
  shelf: 'content'
  /** "$450" or "$450 to $570" or "Quote". Straight from the shared model. */
  priceLabel: string
  /** One line under the title: the first deliverable, else the description. */
  lead: string
  /** Where tapping goes: the creator's storefront, anchored to this package. */
  href: string
}

/** Which vendor crafts count as creatives that belong in the store's content shelf. */
const CREATIVE_CATEGORIES = new Set([
  'food_influencer', 'photographer', 'videographer', 'graphic_designer', 'social_manager',
])

/**
 * Every buyable creator package, newest-vendor-first. `state` filters by service area when given
 * (the store is Washington-only in v1). Returns [] on any read failure, so the store degrades to
 * just the Apnosh catalog rather than erroring.
 */
export async function getCreatorStoreCards(state?: string): Promise<CreatorStoreCard[]> {
  const db = createAdminClient()

  let vq = db
    .from('vendors')
    .select('id, slug, name, vendor_type, bookable, service_area')
    .eq('bookable', true)
    .neq('vendor_type', 'apnosh')
  if (state) vq = vq.contains('service_area', [state])

  const { data: vendors, error: vErr } = await vq
  if (vErr || !vendors || vendors.length === 0) return []

  const byId = new Map(vendors.map((v) => [v.id as string, v]))
  const { data: listings, error: lErr } = await db
    .from('vendor_listings')
    .select('id, vendor_id, slug, title, category, listing_type, description, price_cents, billing_period, details, active')
    .in('vendor_id', [...byId.keys()])
    .eq('active', true)
    .order('display_order', { ascending: true })

  if (lErr || !listings) return []

  const cards: CreatorStoreCard[] = []
  for (const row of listings) {
    if (!CREATIVE_CATEGORIES.has(row.category as string)) continue
    const v = byId.get(row.vendor_id as string)
    if (!v) continue
    const pkg = rowToPackage(row as ListingRow)
    const start = startingPriceCents(pkg)
    const max = maxPriceCents(pkg)
    const priceLabel = start == null ? 'Quote'
      : max != null && max > start ? `${formatCents(start)} to ${formatCents(max)}`
      : formatCents(start)
    cards.push({
      id: `creator:${v.slug}:${row.slug}`,
      vendorSlug: v.slug as string,
      vendorName: v.name as string,
      listingSlug: row.slug as string,
      title: row.title as string,
      category: row.category as string,
      shelf: 'content',
      priceLabel,
      lead: (pkg.deliverables[0] || pkg.description || '').trim(),
      href: `/marketplace/${v.slug}#${row.slug}`,
    })
  }
  return cards
}
