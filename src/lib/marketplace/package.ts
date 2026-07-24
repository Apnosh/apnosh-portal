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

/**
 * How a buyer books this offer. The creator now chooses this per offer instead of it being guessed
 * from the category. scheduled = someone comes on-site, so it needs a time (a calendar); async = a
 * remote deliverable with a turnaround; recurring = an ongoing monthly plan. A "custom quote" offer
 * is listingType 'quote' and has no set price. Canonical here; creative-catalog re-exports it.
 */
export type BookingShape = 'scheduled' | 'async' | 'recurring'

/** One thing the creator needs FROM the buyer before they start — their own intake question. */
export interface IntakeItem {
  id: string
  /** The question, in the buyer's words ("Which dishes should we feature?"). */
  label: string
  /** Optional helper text under the question. */
  hint?: string
  /** A required question blocks the booking until answered. */
  required?: boolean
}

/** One piece the creator hands over on its own — its own delivery, delivered + approved + paid
 *  separately. An offer with an empty deliveries list is a single handoff (the default). When set,
 *  a booking mints one tracked work order per delivery and splits the level's price across them. */
export interface Delivery {
  id: string
  /** What this piece is ("Reel 1", "Edited photos"). */
  label: string
  /** Days after the booking (or shoot day) this piece is due. null/absent = same day. */
  offsetDays?: number | null
}

/** One toggle-able add-on. Its price is added to the base, never subtracted. */
export interface PackageOption {
  id: string
  label: string
  priceDeltaCents: number
}

/**
 * One scope tier of an offering (Good / Better / Best). Tiers scale SCOPE — how many, how much —
 * never quality: it is the same creator, more of the work. Each tier carries its own price and its
 * own list of what the buyer gets. A package with no tiers is the simple one-price case.
 */
export interface PackageTier {
  id: string
  name: string
  priceCents: number
  deliverables: string[]
  /** One short line to tell this tier apart from the others. Optional. */
  note?: string
}

/** The editor's model of a package. Everything a creator sets. */
export interface CreatorPackage {
  id?: string
  slug: string
  title: string
  /** Primary kind of work (the vendor_listings.category column, for the DB CHECK + dispatch). */
  category: PackageCategory
  /** All the kinds of work this offer covers (a content day is photo AND video). categories[0] is
   *  the primary and is kept equal to `category`. Stored in details.categories jsonb. */
  categories: PackageCategory[]
  listingType: ListingType
  description: string
  /** The standard product this is an offering of, from the creative catalog. null = free-form. */
  productId: string | null
  /** null only when listingType is 'quote', or when the price lives in tiers. */
  priceCents: number | null
  billingPeriod: BillingPeriod | null
  /** Used only when tiers is empty (the single-price case). Tiered packages carry scope per tier. */
  deliverables: string[]
  /** 0 = single price (uses priceCents + deliverables). >=1 = tiered (price + scope per tier). */
  tiers: PackageTier[]
  options: PackageOption[]
  turnaroundDays: number | null
  revisions: number | null
  /** Offer photos as public URLs. The first is the cover. Stored in details jsonb. */
  photos: string[]
  /** The creator's own questions for the buyer, asked at booking. Stored in details jsonb. */
  intake: IntakeItem[]
  /** How this offer is delivered/booked. null = fall back to the category guess (legacy rows). */
  bookingShape: BookingShape | null
  /** The separate pieces this offer hands over. Empty = one handoff. When set, a booking mints one
   *  tracked delivery per item and splits the price across them. Stored in details.deliveries. */
  deliveries: Delivery[]
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
  productId?: unknown
  deliverables?: unknown
  options?: unknown
  tiers?: unknown
  turnaroundDays?: unknown
  revisions?: unknown
  photos?: unknown
  intake?: unknown
  bookingShape?: unknown
  categories?: unknown
  deliveries?: unknown
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
  const tiered = p.tiers.length > 0
  if (!p.title.trim()) errs.push('Give your package a name.')
  if (!p.categories.length) errs.push('Pick what kind of work this is.')

  if (p.listingType === 'quote') {
    // A quote is a single custom request: no set price and no tiers.
    if (p.priceCents != null) errs.push('A quote package has no set price. Leave the price blank.')
    if (tiered) errs.push('A quote package is one custom request, so it has no tiers. Remove them or set a price.')
  } else if (tiered) {
    // Price and scope live per tier. Each tier must be priced and say what the buyer gets.
    p.tiers.forEach((t, i) => {
      if (!t.name.trim()) errs.push(`Level ${i + 1} needs a name.`)
      if (!isPosInt(t.priceCents) || t.priceCents <= 0) errs.push(`Level ${i + 1} needs a price above zero.`)
      if (t.deliverables.filter((d) => d.trim()).length === 0) errs.push(`Level ${i + 1} needs at least one thing the buyer gets.`)
    })
  } else {
    // The simple one-price case: a base price and a list of deliverables.
    if (!isPosInt(p.priceCents) || (p.priceCents ?? 0) <= 0) errs.push('Set a price above zero.')
    if (p.deliverables.length === 0) errs.push('List at least one thing the buyer gets.')
  }

  if (p.listingType === 'subscription') {
    if (p.billingPeriod !== 'monthly' && p.billingPeriod !== 'annual') errs.push('A subscription needs a monthly or annual price.')
  }

  if (!p.description.trim()) errs.push('Say in a sentence what this package is.')

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
    productId: p.productId ?? null,
    deliverables: p.deliverables.map((d) => d.trim()).filter(Boolean),
    options: p.options.map((o) => ({ id: o.id, label: o.label.trim(), priceDeltaCents: o.priceDeltaCents })),
    tiers: p.tiers.map((t) => ({
      id: t.id, name: t.name.trim(), priceCents: t.priceCents,
      deliverables: t.deliverables.map((d) => d.trim()).filter(Boolean),
      ...(t.note && t.note.trim() ? { note: t.note.trim() } : {}),
    })),
    turnaroundDays: p.turnaroundDays,
    revisions: p.revisions,
    photos: p.photos.map((u) => u.trim()).filter(Boolean),
    intake: p.intake
      .map((q) => ({
        id: q.id,
        label: q.label.trim(),
        ...(q.hint && q.hint.trim() ? { hint: q.hint.trim() } : {}),
        ...(q.required ? { required: true } : {}),
      }))
      .filter((q) => q.label),
    bookingShape: p.bookingShape,
    categories: (p.categories.length ? p.categories : [p.category]).filter((c) => (PACKAGE_CATEGORIES as readonly string[]).includes(c)),
    deliveries: p.deliveries
      .map((d) => ({ id: d.id, label: d.label.trim(), ...(typeof d.offsetDays === 'number' && d.offsetDays > 0 ? { offsetDays: Math.round(d.offsetDays) } : {}) }))
      .filter((d) => d.label),
  }
  return {
    ...(p.id ? { id: p.id } : {}),
    vendor_id: vendorId,
    slug: p.slug || slugify(p.title),
    title: p.title.trim(),
    category: p.categories[0] ?? p.category,
    listing_type: p.listingType,
    description: p.description.trim(),
    // The column shows the "starting at" number: the lowest tier when tiered, else the base price.
    price_cents: startingPriceCents(p),
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
  const tiers: PackageTier[] = Array.isArray(d.tiers)
    ? d.tiers.flatMap((t, i) => {
        if (!t || typeof t !== 'object') return []
        const tt = t as Record<string, unknown>
        const name = typeof tt.name === 'string' ? tt.name : ''
        const priceCents = isPosInt(tt.priceCents) ? tt.priceCents : 0
        const tierDeliverables = Array.isArray(tt.deliverables) ? tt.deliverables.filter((x): x is string => typeof x === 'string') : []
        if (!name) return []
        return [{
          id: typeof tt.id === 'string' ? tt.id : `tier-${i}`,
          name, priceCents, deliverables: tierDeliverables,
          ...(typeof tt.note === 'string' && tt.note ? { note: tt.note } : {}),
        }]
      })
    : []
  const photos = Array.isArray(d.photos) ? d.photos.filter((x): x is string => typeof x === 'string' && !!x.trim()) : []
  const intake: IntakeItem[] = Array.isArray(d.intake)
    ? d.intake.flatMap((q, i) => {
        if (!q || typeof q !== 'object') return []
        const qq = q as Record<string, unknown>
        const label = typeof qq.label === 'string' ? qq.label : ''
        if (!label.trim()) return []
        return [{
          id: typeof qq.id === 'string' ? qq.id : `ask-${i}`,
          label,
          ...(typeof qq.hint === 'string' && qq.hint ? { hint: qq.hint } : {}),
          ...(qq.required === true ? { required: true } : {}),
        }]
      })
    : []
  const bookingShape: BookingShape | null = (['scheduled', 'async', 'recurring'] as const).includes(d.bookingShape as BookingShape)
    ? (d.bookingShape as BookingShape) : null
  const deliveries: Delivery[] = Array.isArray(d.deliveries)
    ? d.deliveries.flatMap((x, i) => {
        if (!x || typeof x !== 'object') return []
        const xx = x as Record<string, unknown>
        const label = typeof xx.label === 'string' ? xx.label : ''
        if (!label.trim()) return []
        const offset = typeof xx.offsetDays === 'number' && Number.isInteger(xx.offsetDays) && xx.offsetDays > 0 ? xx.offsetDays : null
        return [{ id: typeof xx.id === 'string' ? xx.id : `del-${i}`, label, ...(offset != null ? { offsetDays: offset } : {}) }]
      })
    : []
  const cat = (PACKAGE_CATEGORIES as readonly string[]).includes(row.category) ? (row.category as PackageCategory) : 'other'
  const parsedCats = Array.isArray(d.categories)
    ? d.categories.filter((x): x is PackageCategory => typeof x === 'string' && (PACKAGE_CATEGORIES as readonly string[]).includes(x))
    : []
  const cats: PackageCategory[] = parsedCats.length ? parsedCats : [cat]
  const lt = (['one_off', 'package', 'subscription', 'quote'] as const).includes(row.listing_type as ListingType)
    ? (row.listing_type as ListingType) : 'one_off'
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    category: cats[0],
    categories: cats,
    listingType: lt,
    description: row.description ?? '',
    productId: typeof d.productId === 'string' ? d.productId : null,
    priceCents: typeof row.price_cents === 'number' ? row.price_cents : null,
    billingPeriod: (['monthly', 'annual', 'one_time'] as const).includes(row.billing_period as BillingPeriod)
      ? (row.billing_period as BillingPeriod) : null,
    deliverables,
    tiers,
    options,
    turnaroundDays: isPosInt(d.turnaroundDays) ? d.turnaroundDays : null,
    revisions: isPosInt(d.revisions) ? d.revisions : null,
    photos,
    intake,
    bookingShape,
    deliveries,
    active: row.active ?? true,
  }
}

/**
 * The "starting at" price a card shows: the lowest tier when tiered, else the base price. Options
 * only add on top, so they never lower this. Null = quote (or no price set yet).
 */
export function startingPriceCents(p: Pick<CreatorPackage, 'priceCents' | 'tiers' | 'listingType'>): number | null {
  if (p.listingType === 'quote') return null
  if (p.tiers.length) {
    const prices = p.tiers.map((t) => t.priceCents).filter((n) => isPosInt(n) && n > 0)
    return prices.length ? Math.min(...prices) : null
  }
  return p.priceCents
}

/** The most a buyer could pay: the top tier (or base) plus every option. For an honest "X to Y". */
export function maxPriceCents(p: Pick<CreatorPackage, 'priceCents' | 'tiers' | 'options' | 'listingType'>): number | null {
  if (p.listingType === 'quote') return null
  const addOns = p.options.reduce((s, o) => s + Math.max(0, o.priceDeltaCents), 0)
  if (p.tiers.length) {
    const prices = p.tiers.map((t) => t.priceCents).filter((n) => isPosInt(n) && n > 0)
    return prices.length ? Math.max(...prices) + addOns : null
  }
  if (p.priceCents == null) return null
  return p.priceCents + addOns
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
    slug: '', title: '', category, categories: [category], listingType: 'one_off', description: '', productId: null,
    priceCents: null, billingPeriod: 'one_time', deliverables: [], tiers: [], options: [],
    turnaroundDays: null, revisions: null, photos: [], intake: [], bookingShape: 'scheduled', deliveries: [], active: false,
  }
}
