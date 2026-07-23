/**
 * /api/dev/seed-example-creators — DEMO SEEDER. Creates a few clearly-labelled example creators
 * with real packages so the store's "From local creators" spotlight and content-shelf mix can be
 * SEEN populated before real creators are onboarded.
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
import { packageToRow, type CreatorPackage } from '@/lib/marketplace/package'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface ExampleCreator {
  slug: string
  name: string
  craft: 'Video' | 'Photo' | 'Social'
  description: string
  pkg: CreatorPackage
}

const EXAMPLES: ExampleCreator[] = [
  {
    slug: 'example-maya-video', name: 'Maya Rivera (Example)', craft: 'Video',
    description: 'Restaurant reels shot and cut for social. Seattle-based.',
    pkg: {
      slug: 'signature-reel-pack', title: 'Signature Reel Pack', category: 'videographer',
      listingType: 'one_off', description: 'Three short reels shot and edited at your restaurant, ready to post.',
      priceCents: 45000, billingPeriod: 'one_time',
      deliverables: ['3 vertical reels', '1 hero cut for ads'],
      options: [
        { id: 'opt-extra-reel', label: 'Extra reel', priceDeltaCents: 12000 },
        { id: 'opt-rush', label: 'Rush in 48 hours', priceDeltaCents: 15000 },
      ],
      turnaroundDays: 10, revisions: 2, active: true,
    },
  },
  {
    slug: 'example-leo-photo', name: 'Leo Tanaka (Example)', craft: 'Photo',
    description: 'Food photography that makes the plate the hero.',
    pkg: {
      slug: 'dish-photo-day', title: 'Dish Photo Day', category: 'photographer',
      listingType: 'one_off', description: 'A half-day shoot at your restaurant with about 20 finished photos.',
      priceCents: 60000, billingPeriod: 'one_time',
      deliverables: ['20 edited photos', 'Shot list planned before the day'],
      options: [{ id: 'opt-drinks', label: 'Add your drinks menu', priceDeltaCents: 15000 }],
      turnaroundDays: 7, revisions: 1, active: true,
    },
  },
  {
    slug: 'example-priya-social', name: 'Priya Nair (Example)', craft: 'Social',
    description: 'Local food creator. Tastings and honest posts to a Seattle audience.',
    pkg: {
      slug: 'tasting-post', title: 'Tasting Post', category: 'food_influencer',
      listingType: 'one_off', description: 'A visit, a tasting, and a post that sends real people your way.',
      priceCents: 30000, billingPeriod: 'one_time',
      deliverables: ['1 in-feed post', '3 stories with your location tagged'],
      options: [{ id: 'opt-reel', label: 'Add a reel', priceDeltaCents: 20000 }],
      turnaroundDays: 5, revisions: null, active: true,
    },
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

    const row = packageToRow(ex.pkg, vendor.id as string)
    await db.from('vendor_listings').upsert(row, { onConflict: 'vendor_id,slug' })
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
