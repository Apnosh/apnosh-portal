/**
 * /api/dev/seed-example-creators — DEMO SEEDER. Creates a few clearly-labelled example creators
 * with real packages so the store's "From local creators" spotlight and content-shelf mix can be
 * SEEN populated before real creators are onboarded.
 *
 * Packages are built from the standard creative catalog (the same products a real creator picks),
 * then priced per level. So the demo exercises the whole model: tiered one-offs, a single-price
 * offering, and a monthly management subscription.
 *
 * Everything it touches is namespaced `example-*` and every name ends in "(Example)", so it is
 * unmistakable and trivially removable. POST seeds, DELETE removes. Both require a logged-in user
 * and only ever operate on `example-*` vendors, so the blast radius is contained to demo data.
 *
 * This is scaffolding for a demo, not a product surface. Remove the route once real creators are
 * seeded, or call DELETE to clear the examples.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { createAdminClient } from '@/lib/supabase/admin'
import { packageToRow, type CreatorPackage, type PackageCategory } from '@/lib/marketplace/package'
import { productById, packageFromProduct } from '@/lib/marketplace/creative-catalog'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Build a priced package from a standard product: fill tier prices (dollars), add priced add-ons. */
function offer(productId: string, opts: {
  tierPrices?: number[]        // dollars per level, in catalog order
  price?: number               // dollars, for single-price products (no tiers)
  addOns?: Record<string, number> // label -> dollars
  turnaroundDays?: number | null
  revisions?: number | null
}): CreatorPackage {
  const product = productById(productId)
  if (!product) throw new Error(`unknown product ${productId}`)
  const pkg = packageFromProduct(product)
  pkg.active = true
  if (pkg.tiers.length && opts.tierPrices) {
    pkg.tiers = pkg.tiers.map((t, i) => ({ ...t, priceCents: Math.round((opts.tierPrices![i] ?? 0) * 100) }))
  }
  if (!pkg.tiers.length && opts.price != null) pkg.priceCents = Math.round(opts.price * 100)
  if (opts.addOns) {
    pkg.options = Object.entries(opts.addOns).map(([label, dollars], i) => ({ id: `opt-${i}`, label, priceDeltaCents: Math.round(dollars * 100) }))
  }
  if (opts.turnaroundDays !== undefined) pkg.turnaroundDays = opts.turnaroundDays
  if (opts.revisions !== undefined) pkg.revisions = opts.revisions
  return pkg
}

// vendors.craft is a coarse dispatch key (CHECK: Video/Photo/Social/Design), not the listing
// category. The listing category (which drives the store shelf) comes from the product.
const CRAFT_KEY: Record<PackageCategory, 'Video' | 'Photo' | 'Social' | 'Design'> = {
  videographer: 'Video', photographer: 'Photo', food_influencer: 'Social',
  graphic_designer: 'Design', social_manager: 'Social', web_designer: 'Design',
  local_seo: 'Social', email_marketer: 'Social', pr_specialist: 'Social',
  strategist: 'Social', full_service_agency: 'Social', other: 'Social',
}

interface ExampleCreator {
  slug: string
  name: string
  craft: PackageCategory
  description: string
  packages: CreatorPackage[]
}

const EXAMPLES: ExampleCreator[] = [
  {
    slug: 'example-maya-video', name: 'Maya Rivera (Example)', craft: 'videographer',
    description: 'Restaurant reels shot and cut for social. Seattle-based.',
    packages: [
      offer('reel-pack', {
        tierPrices: [350, 450, 650],
        addOns: { 'Extra reel': 120, 'Rush in 48 hours': 150 },
        turnaroundDays: 10, revisions: 2,
      }),
    ],
  },
  {
    slug: 'example-leo-photo', name: 'Leo Tanaka (Example)', craft: 'photographer',
    description: 'Food photography that makes the plate the hero.',
    packages: [
      offer('dish-photo-day', {
        tierPrices: [400, 600, 850],
        addOns: { 'Add your drinks menu': 150 },
        turnaroundDays: 7, revisions: 1,
      }),
      offer('brand-photo-day', {
        price: 700,
        addOns: { 'Add headshots for the team': 200 },
        turnaroundDays: 10, revisions: 1,
      }),
    ],
  },
  {
    slug: 'example-priya-social', name: 'Priya Nair (Example)', craft: 'food_influencer',
    description: 'Local food creator. Tastings and honest posts to a Seattle audience.',
    packages: [
      offer('tasting-post', {
        tierPrices: [200, 300, 500],
        addOns: { 'Whitelist for you to boost as an ad': 150 },
        turnaroundDays: 5, revisions: null,
      }),
    ],
  },
  {
    slug: 'example-sofia-manager', name: 'Sofia Reyes (Example)', craft: 'social_manager',
    description: 'Runs restaurant social month to month, so your feed never goes quiet.',
    packages: [
      offer('monthly-social', {
        tierPrices: [400, 700, 1100],
        addOns: { 'Add reply management': 150 },
        turnaroundDays: null, revisions: null,
      }),
    ],
  },
]

export async function POST(req: NextRequest) {
  const { user } = await resolveCurrentClient(req.nextUrl.searchParams.get('clientId'))
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createAdminClient()
  const created: string[] = []

  for (const ex of EXAMPLES) {
    const { data: vendor, error: vErr } = await db
      .from('vendors')
      .upsert({
        slug: ex.slug, name: ex.name, vendor_type: 'individual', bookable: true,
        verified: false, tier: 'free', is_apnosh: false, service_area: ['WA'],
        craft: ex.craft, description: ex.description,
      }, { onConflict: 'slug' })
      .select('id')
      .maybeSingle()
    if (vErr || !vendor) continue

    for (const pkg of ex.packages) {
      const row = packageToRow(pkg, vendor.id as string)
      await db.from('vendor_listings').upsert(row, { onConflict: 'vendor_id,slug' })
    }
    created.push(ex.slug)
  }

  return NextResponse.json({ ok: true, created })
}

export async function DELETE(req: NextRequest) {
  const { user } = await resolveCurrentClient(req.nextUrl.searchParams.get('clientId'))
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createAdminClient()
  // Cascade on vendors deletes their listings (vendor_listings.vendor_id ON DELETE CASCADE).
  const { data } = await db.from('vendors').delete().like('slug', 'example-%').select('slug')
  return NextResponse.json({ ok: true, removed: (data ?? []).map((r) => r.slug) })
}
