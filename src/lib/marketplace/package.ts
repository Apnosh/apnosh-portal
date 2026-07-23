/**
 * CREATOR PACKAGE — the model a creator fills in when they publish an offering, and the one the
 * storefront reads back. Pure, no I/O, so the editor and the public card can never disagree
 * about what a package IS.
 *
 * This is the heart of the seller side of the creative marketplace: a creator sets their OWN
 * price and their OWN options, rather than picking from the Apnosh catalog. It maps onto the
 * existing `vendor_listings` table (migration 146) so nothing new is needed in the schema — the
 * free-form `details` jsonb column was left there for exactly this. This module is the one place
 * that decides the shape of that jsonb, so a package written by the editor is always readable by
 * the storefront and vice versa.
 *
 * What a package carries:
 *   a base price          what the creator charges for the core deliverable (or "quote" for none)
 *   deliverables          the plain list of what the buyer gets ("3 reels", "20 edited photos")
 *   options               add-ons the buyer can toggle, each with its own price on top
 *
 * The base price is the FLOOR ("starting at"); options only add. There is no bidding and no
 * downward flex, which keeps the number a buyer sees honest and easy to reason about.
 */

/** The 12 categories from vendor_listings.category. Kept in lockstep with the DB CHECK. */
export const PACKAGE_CATEGORIES = [
  'food_influencer', 'photographer', 'videographer',
  'graphic_designer', 'web_designer', 'social_manager',
  'local_seo', 'email_marketer', 'pr_specialist',
  'strategist', 'full_service_agency', 'other',
] as const
export type PackageCategory = (typeof PACKAGE_CATEGORIES)[number]

/** vendor_listings.listing_type. */
export type ListingType = 'one_off' | 'package' | 'subscription' | 'quote'
export type BillingPeriod = 'monthly' | 'annual' | 'one_time'

/** One toggle-able add-on. Its price is added to the base, never subtracted. */
export interface PackageOption {
  id: string
  label: string
  priceDeltaCents: number
}

/** The editor's model of a package. Everything a creator sets. */
export interface CreatorPackage {
  id?: string
  slug: string
  title: string
  category: PackageCategory
  listingType: ListingType
  description: string
  /** null only when listingType is 'quote'. */
  priceCents: number | null
  billingPeriod: BillingPeriod | null
  deliverables: string[]
  options: PackageOption[]
  turnaroundDays: number | null
  revisions: number | null
  active: boolean
}

/** The subset of a vendor_listings row this module reads. */
export interface ListingRow {
  id?: string
  vendor_id?: string
  slug: string
  title: string
  category: string
  listing_type: string
  description: string | null
  price_cents: number | null
  billing_period: string | null
  details: unknown
  active?: boolean
}

/** What we store in details. Nothing else lives there, so the editor owns the whole shape. */
interface PackageDetails {
  deliverables?: unknown
  options?: unknown
  turnaroundDays?: unknown
  revisions?: unknown
}

/** A URL-safe slug from a title. Deterministic, so the same title always maps to the same slug
 *  (the table is unique on vendor_id + slug, so a rename is a real new listing, which is fine). */
export function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'package'
}

const isPosInt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0

/**
 * Validate a package the way the editor and the server action both must. Returns the list of
 * plain, owner-facing problems (empty = valid). Shared so the form and the write path can never
 * disagree on what a legal package is.
 */
export function validatePackage(p: CreatorPackage): string[] {
  const errs: string[] = []
  if (!p.title.trim()) errs.push('Give your package a name.')
  if (!PACKAGE_CATEGORIES.includes(p.category)) errs.push('Pick what kind of work this is.')

  if (p.listingType === 'quote') {
    if (p.priceCents != null) errs.push('A quote package has no set price. Leave the price blank.')
  } else {
    if (!isPosInt(p.priceCents) || (p.priceCents ?? 0) <= 0) errs.push('Set a price above zero.')
  }

  if (p.listingType === 'subscription') {
    if (p.billingPeriod !== 'monthly' && p.billingPeriod !== 'annual') errs.push('A subscription needs a monthly or annual price.')
  }

  if (!p.description.trim()) errs.push('Say in a sentence what this package is.')
  if (p.deliverables.length === 0) errs.push('List at least one thing the buyer gets.')

  p.options.forEach((o, i) => {
    if (!o.label.trim()) errs.push(`Add-on ${i + 1} needs a name.`)
    if (!isPosInt(o.priceDeltaCents)) errs.push(`Add-on ${i + 1} needs a price of zero or more.`)
  })
  if (p.turnaroundDays != null && !isPosInt(p.turnaroundDays)) errs.push('Turnaround must be a whole number of days.')
  if (p.revisions != null && !isPosInt(p.revisions)) errs.push('Revisions must be a whole number.')

  return errs
}

/** Turn an editor package into the vendor_listings row to write. Assumes validatePackage passed. */
export function packageToRow(p: CreatorPackage, vendorId: string): ListingRow {
  const details: PackageDetails = {
    deliverables: p.deliverables.map((d) => d.trim()).filter(Boolean),
    options: p.options.map((o) => ({ id: o.id, label: o.label.trim(), priceDeltaCents: o.priceDeltaCents })),
    turnaroundDays: p.turnaroundDays,
    revisions: p.revisions,
  }
  return {
    ...(p.id ? { id: p.id } : {}),
    vendor_id: vendorId,
    slug: p.slug || slugify(p.title),
    title: p.title.trim(),
    category: p.category,
    listing_type: p.listingType,
    description: p.description.trim(),
    price_cents: p.listingType === 'quote' ? null : p.priceCents,
    billing_period: p.listingType === 'subscription' ? p.billingPeriod : (p.listingType === 'quote' ? null : 'one_time'),
    details,
    active: p.active,
  }
}

/** Read a row back into an editor package, tolerating any legacy / hand-written details shape. */
export function rowToPackage(row: ListingRow): CreatorPackage {
  const d = (row.details && typeof row.details === 'object' ? row.details : {}) as PackageDetails
  const deliverables = Array.isArray(d.deliverables) ? d.deliverables.filter((x): x is string => typeof x === 'string') : []
  const options: PackageOption[] = Array.isArray(d.options)
    ? d.options.flatMap((o, i) => {
        if (!o || typeof o !== 'object') return []
        const oo = o as Record<string, unknown>
        const label = typeof oo.label === 'string' ? oo.label : ''
        const priceDeltaCents = isPosInt(oo.priceDeltaCents) ? oo.priceDeltaCents : 0
        if (!label) return []
        return [{ id: typeof oo.id === 'string' ? oo.id : `opt-${i}`, label, priceDeltaCents }]
      })
    : []
  const cat = (PACKAGE_CATEGORIES as readonly string[]).includes(row.category) ? (row.category as PackageCategory) : 'other'
  const lt = (['one_off', 'package', 'subscription', 'quote'] as const).includes(row.listing_type as ListingType)
    ? (row.listing_type as ListingType) : 'one_off'
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    category: cat,
    listingType: lt,
    description: row.description ?? '',
    priceCents: typeof row.price_cents === 'number' ? row.price_cents : null,
    billingPeriod: (['monthly', 'annual', 'one_time'] as const).includes(row.billing_period as BillingPeriod)
      ? (row.billing_period as BillingPeriod) : null,
    deliverables,
    options,
    turnaroundDays: isPosInt(d.turnaroundDays) ? d.turnaroundDays : null,
    revisions: isPosInt(d.revisions) ? d.revisions : null,
    active: row.active ?? true,
  }
}

/** The "starting at" price a card shows: the base, since options only add on top. Null = quote. */
export function startingPriceCents(p: Pick<CreatorPackage, 'priceCents'>): number | null {
  return p.priceCents
}

/** The most a buyer could pay: base plus every option. Useful for an honest "from X to Y" range. */
export function maxPriceCents(p: Pick<CreatorPackage, 'priceCents' | 'options'>): number | null {
  if (p.priceCents == null) return null
  return p.priceCents + p.options.reduce((s, o) => s + Math.max(0, o.priceDeltaCents), 0)
}

/** $1,299 from 129900. Whole dollars unless there are cents. */
export function formatCents(cents: number | null): string {
  if (cents == null) return 'Quote'
  const dollars = cents / 100
  return dollars % 1 === 0
    ? `$${dollars.toLocaleString('en-US')}`
    : `$${dollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** A blank package to seed the editor's "new" form. */
export function emptyPackage(category: PackageCategory = 'videographer'): CreatorPackage {
  return {
    slug: '', title: '', category, listingType: 'one_off', description: '',
    priceCents: null, billingPeriod: 'one_time', deliverables: [], options: [],
    turnaroundDays: null, revisions: null, active: false,
  }
}
