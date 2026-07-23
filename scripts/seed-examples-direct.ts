/**
 * seed-examples-direct — seeds the example creators straight through the service-role client,
 * the same rows the /api/dev/seed-example-creators route writes, but runnable from a script so the
 * public storefront can be rendered and checked without a browser session. example-* only.
 *
 * Run: node_modules/.bin/tsx scripts/seed-examples-direct.ts   (loads .env.local itself)
 */

import fs from 'fs'
import { packageToRow, type CreatorPackage, type PackageCategory } from '../src/lib/marketplace/package'
import { productById, packageFromProduct } from '../src/lib/marketplace/creative-catalog'

// Load .env.local into process.env before any client is created (admin client reads env at call time).
for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

// vendors.craft is a coarse dispatch key (CHECK: Video/Photo/Social/Design), not the listing
// category. The listing category (which drives the store shelf) comes from the product.
const CRAFT_KEY: Record<PackageCategory, 'Video' | 'Photo' | 'Social' | 'Design'> = {
  videographer: 'Video', photographer: 'Photo', food_influencer: 'Social',
  graphic_designer: 'Design', social_manager: 'Social', web_designer: 'Design',
  local_seo: 'Social', email_marketer: 'Social', pr_specialist: 'Social',
  strategist: 'Social', full_service_agency: 'Social', other: 'Social',
}

function offer(productId: string, o: { tierPrices?: number[]; price?: number; addOns?: Record<string, number>; turnaroundDays?: number | null; revisions?: number | null }): CreatorPackage {
  const product = productById(productId)!
  const p = packageFromProduct(product)
  p.active = true
  if (p.tiers.length && o.tierPrices) p.tiers = p.tiers.map((t, i) => ({ ...t, priceCents: Math.round((o.tierPrices![i] ?? 0) * 100) }))
  if (!p.tiers.length && o.price != null) p.priceCents = Math.round(o.price * 100)
  if (o.addOns) p.options = Object.entries(o.addOns).map(([label, d], i) => ({ id: `opt-${i}`, label, priceDeltaCents: Math.round(d * 100) }))
  if (o.turnaroundDays !== undefined) p.turnaroundDays = o.turnaroundDays
  if (o.revisions !== undefined) p.revisions = o.revisions
  return p
}

const EXAMPLES: { slug: string; name: string; craft: PackageCategory; description: string; packages: CreatorPackage[] }[] = [
  { slug: 'example-maya-video', name: 'Maya Rivera (Example)', craft: 'videographer', description: 'Restaurant reels shot and cut for social. Seattle-based.',
    packages: [offer('reel-pack', { tierPrices: [350, 450, 650], addOns: { 'Extra reel': 120, 'Rush in 48 hours': 150 }, turnaroundDays: 10, revisions: 2 })] },
  { slug: 'example-leo-photo', name: 'Leo Tanaka (Example)', craft: 'photographer', description: 'Food photography that makes the plate the hero.',
    packages: [
      offer('dish-photo-day', { tierPrices: [400, 600, 850], addOns: { 'Add your drinks menu': 150 }, turnaroundDays: 7, revisions: 1 }),
      offer('brand-photo-day', { price: 700, addOns: { 'Add headshots for the team': 200 }, turnaroundDays: 10, revisions: 1 }),
    ] },
  { slug: 'example-priya-social', name: 'Priya Nair (Example)', craft: 'food_influencer', description: 'Local food creator. Tastings and honest posts to a Seattle audience.',
    packages: [offer('tasting-post', { tierPrices: [200, 300, 500], addOns: { 'Whitelist for you to boost as an ad': 150 }, turnaroundDays: 5, revisions: null })] },
  { slug: 'example-sofia-manager', name: 'Sofia Reyes (Example)', craft: 'social_manager', description: 'Runs restaurant social month to month, so your feed never goes quiet.',
    packages: [offer('monthly-social', { tierPrices: [400, 700, 1100], addOns: { 'Add reply management': 150 }, turnaroundDays: null, revisions: null })] },
]

async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin')
  const db = createAdminClient()
  for (const ex of EXAMPLES) {
    const { data: vendor, error } = await db.from('vendors').upsert({
      slug: ex.slug, name: ex.name, vendor_type: 'individual', bookable: true,
      verified: false, tier: 'free', is_apnosh: false, service_area: ['WA'], craft: CRAFT_KEY[ex.craft], description: ex.description,
    }, { onConflict: 'slug' }).select('id').maybeSingle()
    if (error || !vendor) { console.log(`  FAIL  ${ex.slug}: ${error?.message}`); continue }
    // Clear any prior listings for this example vendor so stale slugs from an earlier seed do not linger.
    await db.from('vendor_listings').delete().eq('vendor_id', vendor.id as string)
    for (const pkg of ex.packages) {
      const row = packageToRow(pkg, vendor.id as string)
      const { error: lErr } = await db.from('vendor_listings').upsert(row, { onConflict: 'vendor_id,slug' })
      console.log(lErr ? `  FAIL  ${ex.slug}/${row.slug}: ${lErr.message}` : `  OK    ${ex.slug}/${row.slug} (${pkg.tiers.length} levels)`)
    }
  }
  console.log('done')
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
