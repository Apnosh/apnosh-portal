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
import { productById, bookingShapeForCategory, type BookingShape, type IntakeQuestion } from './creative-catalog'

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
  /** Everything the in-store product page needs, so it can render exactly like a campaign page. */
  description: string
  deliverables: string[]
  /** Scope tiers the buyer can pick between. Empty = a single-price offering. */
  tiers: { id: string; name: string; priceCents: number; deliverables: string[]; note?: string }[]
  options: { label: string; priceDeltaCents: number }[]
  turnaroundDays: number | null
  revisions: number | null
  priceCents: number | null
  maxPriceCents: number | null
  /** True when this is billed monthly (a management plan), so the page reads "a month". */
  recurring: boolean
  /** True when this is a custom job with no set price — the creator quotes it before it books. */
  quote: boolean
  /** How this books: scheduled (pick a slot), async (a brief), recurring (a start date). */
  bookingShape: BookingShape
  /** The 2-3 questions to ask at booking, so the creator starts ready. */
  intake: IntakeQuestion[]
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
    const per = pkg.listingType === 'subscription' ? '/mo' : ''
    const priceLabel = start == null ? 'Quote'
      : max != null && max > start ? `${formatCents(start)} to ${formatCents(max)}${per}`
      : `${formatCents(start)}${per}`
    // When tiered, the card leads with the cheapest tier's first line; the product page shows the
    // selected tier's full list. When not tiered, top-level deliverables carry it (unchanged).
    const tiered = pkg.tiers.length > 0
    const leadDeliverable = tiered ? (pkg.tiers[0]?.deliverables[0] ?? '') : (pkg.deliverables[0] ?? '')
    // Booking shape + intake come from the standard product; a from-scratch package falls back to
    // its craft (shoots scheduled, design async, management recurring) with no intake.
    const product = productById(pkg.productId)
    const bookingShape: BookingShape = product ? product.bookingShape : bookingShapeForCategory(pkg.category)
    const intake: IntakeQuestion[] = product ? product.intake : []
    cards.push({
      id: `creator:${v.slug}:${row.slug}`,
      vendorSlug: v.slug as string,
      vendorName: v.name as string,
      listingSlug: row.slug as string,
      title: row.title as string,
      category: row.category as string,
      shelf: 'content',
      priceLabel,
      lead: (leadDeliverable || pkg.description || '').trim(),
      href: `/marketplace/${v.slug}#${row.slug}`,
      description: pkg.description,
      deliverables: tiered ? (pkg.tiers[0]?.deliverables ?? []) : pkg.deliverables,
      tiers: pkg.tiers.map((t) => ({ id: t.id, name: t.name, priceCents: t.priceCents, deliverables: t.deliverables, ...(t.note ? { note: t.note } : {}) })),
      options: pkg.options.map((o) => ({ label: o.label, priceDeltaCents: o.priceDeltaCents })),
      turnaroundDays: pkg.turnaroundDays,
      revisions: pkg.revisions,
      priceCents: start,
      maxPriceCents: max,
      recurring: pkg.listingType === 'subscription',
      quote: pkg.listingType === 'quote',
      bookingShape,
      intake,
    })
  }
  return cards
}
