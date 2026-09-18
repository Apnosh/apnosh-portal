/**
 * Two example creators for the influencer marketplace (owner 2026-09-17: "make like 2 fake ones
 * but fully functional profiles"). Everything a real creator's profile would hold: offers with
 * tiers, an audience row, recent posts with numbers, past collabs, reviews, a calendar.
 *
 *   npx tsx scripts/seed-example-influencers.ts          seed or refresh
 *   npx tsx scripts/seed-example-influencers.ts remove   take both off
 *
 * Marked "(Example)" in the vendor name; the page strips it and shows an "Example profile" pill.
 * The audience and posts tables come from migration 268; until it runs those parts are skipped
 * and the script says so.
 */
import { config } from 'dotenv'
config({ path: '/Users/mjbutler35/Documents/GitHub/apnosh-portal/.env.local' })
import { createClient } from '@supabase/supabase-js'
import { packageToRow, type CreatorPackage } from '../src/lib/marketplace/package'
import { productById, packageFromProduct } from '../src/lib/marketplace/creative-catalog'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)

function offer(productId: string, o: { tierPrices?: number[]; price?: number; addOns?: { label: string; priceDeltaCents: number }[]; slotMinutes?: number; title?: string; description?: string; tiers?: { name: string; priceCents: number; deliverables: string[]; note?: string }[]; deliverables?: string[] }): CreatorPackage {
  const p = productById(productId)
  if (!p) throw new Error(`no product ${productId}`)
  const pkg = packageFromProduct(p)
  if (o.tiers) pkg.tiers = o.tiers.map((t, i) => ({ id: `tier-${i}`, name: t.name, priceCents: t.priceCents, deliverables: t.deliverables, note: t.note }))
  else if (o.tierPrices) pkg.tiers = pkg.tiers.map((t, i) => ({ ...t, priceCents: o.tierPrices![i] ?? t.priceCents }))
  if (o.price != null) pkg.priceCents = o.price
  if (o.title) { pkg.title = o.title; pkg.slug = o.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') }
  if (o.description) pkg.description = o.description
  if (o.deliverables) pkg.deliverables = o.deliverables
  pkg.options = (o.addOns ?? []).map((a, i) => ({ id: `opt-${i}`, label: a.label, priceDeltaCents: a.priceDeltaCents }))
  if (o.slotMinutes) pkg.slotMinutes = o.slotMinutes
  pkg.turnaroundDays = 5
  pkg.active = true
  return pkg
}

const EX = [
  {
    slug: 'example-priya-social', name: 'Priya Nair (Example)', craft: 'Social',
    description: 'I eat my way through Seattle and I only post what I would send my sister to. Small spots, big flavor, honest takes.',
    avg_rating: 5.0, total_bookings: 9,
    packages: [
      offer('tasting-post', { tierPrices: [20000, 30000, 50000], addOns: [{ label: 'Whitelist for you to boost as an ad', priceDeltaCents: 15000 }], slotMinutes: 90 }),
      offer('reel-collab', { price: 45000, slotMinutes: 120, description: 'One Reel filmed at your place, posted to her audience and yours. You keep the video.' }),
      offer('tasting-post', { title: 'Giveaway', description: 'A post and a Story, dinner for two on you. Entries follow you and tag a friend.', tiers: [], price: 25000, deliverables: ['1 giveaway post', '1 Story reminder', 'Entries follow you and tag a friend', 'Winner picked in 5 days'], slotMinutes: 60 }),
    ],
    audience: { city: 'Seattle', platforms: [{ platform: 'instagram', handle: 'priyaeatsseattle', followers: 18400, avg_views: 24000, engagement: 6.8, url: 'https://instagram.com/explore/tags/seattlefood', verified_at: daysAgo(3) }, { platform: 'tiktok', handle: 'priyaeats', followers: 6100, avg_views: 9000, engagement: 5.1, url: null, verified_at: null }], followers: 18400, avg_views: 24000, engagement: 6.8, local_pct: 71, ages: '25 to 34', cuisines: ['Vietnamese', 'Korean', 'Brunch', 'Dessert'], styles: ['Honest', 'Small spots', 'Family'], languages: ['English', 'Hindi'], response_hours: 2, posts_within_days: 5, party_size: 2, meal_cap_cents: 6000, repost_ok: true, whitelist_cents: 15000, verified_at: daysAgo(3) },
    posts: [
      { kind: 'sample', platform: 'instagram', caption: 'The birria at Salt & Ember', views: 41000, likes: 1240, saves: 312, comments: 58, posted_at: daysAgo(12), url: 'https://instagram.com/explore/tags/seattlefood' },
      { kind: 'sample', platform: 'instagram', caption: 'Ube croissant, gone by noon', views: 28000, likes: 902, saves: 240, comments: 96, posted_at: daysAgo(22), url: 'https://instagram.com/explore/tags/seattlefood' },
      { kind: 'sample', platform: 'instagram', caption: 'Egg coffee, the real one', views: 19000, likes: 610, saves: 150, comments: 31, posted_at: daysAgo(31), url: 'https://instagram.com/explore/tags/seattlefood' },
      { kind: 'sample', platform: 'tiktok', caption: 'Bánh mì crawl, part 2', views: 33000, likes: 2100, saves: 400, comments: 120, posted_at: daysAgo(40), url: 'https://www.tiktok.com/tag/seattlefood' },
      { kind: 'sample', platform: 'instagram', caption: 'Late night tteokbokki', views: 12000, likes: 480, saves: 90, comments: 22, posted_at: daysAgo(48), url: 'https://instagram.com/explore/tags/seattlefood' },
      { kind: 'sample', platform: 'instagram', caption: 'Brunch at the counter', views: 22000, likes: 730, saves: 201, comments: 44, posted_at: daysAgo(60), url: 'https://instagram.com/explore/tags/seattlefood' },
      { kind: 'collab', platform: 'instagram', caption: 'Reel + post', views: 41000, likes: 1240, saves: 312, comments: 58, posted_at: daysAgo(30), note: '58 new followers for them that week', listing: 'Tasting Visit + Post' },
      { kind: 'collab', platform: 'instagram', caption: 'Post + stories', views: 28000, likes: 902, saves: 240, comments: 96, posted_at: daysAgo(58), note: 'sold out of the ube croissant by noon', listing: 'Tasting Visit + Post' },
      { kind: 'collab', platform: 'instagram', caption: 'Story set', views: 9000, likes: 0, saves: 0, comments: 0, link_taps: 140, posted_at: daysAgo(80), note: null, listing: 'Tasting Visit + Post' },
    ],
    reviews: [{ stars: 5, comment: 'Her post filled our Tuesday with real guests. Easy, on time, honest.', daysAgo: 30 }, { stars: 5, comment: 'She asked good questions before and told the story right.', daysAgo: 58 }],
    weekly: { '4': [{ start: '11:30', end: '14:00' }, { start: '17:30', end: '20:30' }], '5': [{ start: '17:30', end: '20:30' }], '6': [{ start: '11:30', end: '14:00' }, { start: '17:30', end: '20:30' }], '0': [{ start: '11:00', end: '14:00' }] }, confirm: 'request',
  },
  {
    slug: 'example-marcus-tiktok', name: 'Marcus Oyelaran (Example)', craft: 'Social',
    description: 'South Sound eats, one video at a time. Smash burgers, smoked brisket, the halal cart nobody knows about yet. I film everything on the day.',
    avg_rating: 4.8, total_bookings: 14,
    packages: [
      offer('tasting-post', { tierPrices: [35000, 45000, 70000], addOns: [{ label: 'Whitelist for you to boost as an ad', priceDeltaCents: 20000 }, { label: 'A second video a week later', priceDeltaCents: 30000 }], slotMinutes: 90 }),
      offer('reel-collab', { price: 65000, slotMinutes: 120, description: 'One video filmed at your place, cut for TikTok and Reels, posted to his audience and yours.' }),
    ],
    audience: { city: 'Tacoma', platforms: [{ platform: 'tiktok', handle: 'marcuseatstacoma', followers: 62000, avg_views: 85000, engagement: 4.1, url: 'https://www.tiktok.com/tag/tacomafood', verified_at: daysAgo(6) }, { platform: 'instagram', handle: 'marcuseats', followers: 9200, avg_views: 7000, engagement: 3.4, url: 'https://instagram.com/explore/tags/tacomafood', verified_at: daysAgo(6) }], followers: 62000, avg_views: 85000, engagement: 4.1, local_pct: 58, ages: '18 to 34', cuisines: ['BBQ', 'Burgers', 'Late night', 'Halal', 'Filipino'], styles: ['Loud', 'First bite on camera', 'Hidden spots'], languages: ['English'], response_hours: 20, posts_within_days: 7, party_size: 2, meal_cap_cents: 8000, repost_ok: true, whitelist_cents: 20000, verified_at: daysAgo(6) },
    posts: [
      { kind: 'sample', platform: 'tiktok', caption: 'The brisket that broke Tacoma', views: 210000, likes: 18400, saves: 3100, comments: 640, posted_at: daysAgo(9), url: 'https://www.tiktok.com/tag/tacomafood' },
      { kind: 'sample', platform: 'tiktok', caption: 'Smash burger, 2 am', views: 96000, likes: 7100, saves: 1200, comments: 210, posted_at: daysAgo(17), url: 'https://www.tiktok.com/tag/tacomafood' },
      { kind: 'sample', platform: 'tiktok', caption: 'Halal cart, no sign, no line yet', views: 74000, likes: 5900, saves: 1800, comments: 330, posted_at: daysAgo(25), url: 'https://www.tiktok.com/tag/tacomafood' },
      { kind: 'sample', platform: 'instagram', caption: 'Lumpia, three ways', views: 8000, likes: 410, saves: 70, comments: 19, posted_at: daysAgo(33), url: 'https://instagram.com/explore/tags/tacomafood' },
      { kind: 'sample', platform: 'tiktok', caption: 'Rating every taco truck on 6th', views: 130000, likes: 9800, saves: 2400, comments: 512, posted_at: daysAgo(44), url: 'https://www.tiktok.com/tag/tacomafood' },
      { kind: 'sample', platform: 'tiktok', caption: 'Pho at midnight', views: 51000, likes: 3900, saves: 700, comments: 140, posted_at: daysAgo(55), url: 'https://www.tiktok.com/tag/tacomafood' },
      { kind: 'collab', platform: 'tiktok', caption: 'Reel collab', views: 118000, likes: 9100, saves: 2000, comments: 410, posted_at: daysAgo(21), note: 'line out the door that Saturday', listing: 'Reel Collaboration' },
      { kind: 'collab', platform: 'tiktok', caption: 'Reel + post', views: 66000, likes: 4800, saves: 900, comments: 180, posted_at: daysAgo(49), note: null, listing: 'Tasting Visit + Post' },
    ],
    reviews: [{ stars: 5, comment: 'Biggest Saturday we have had. He showed up, ate, filmed, and the video was up in four days.', daysAgo: 21 }, { stars: 4, comment: 'Great reach. Took a week to hear back the first time.', daysAgo: 49 }, { stars: 5, comment: 'Our brisket sold out two days running.', daysAgo: 90 }],
    weekly: { '5': [{ start: '17:00', end: '21:00' }], '6': [{ start: '12:00', end: '15:00' }, { start: '17:00', end: '21:00' }], '0': [{ start: '12:00', end: '16:00' }] }, confirm: 'instant',
  },
]

async function main() {
  if (process.argv[2] === 'remove') {
    const { data } = await db.from('vendors').delete().in('slug', EX.map((e) => e.slug)).select('slug')
    console.log('removed', (data ?? []).map((r) => r.slug))
    return
  }
  const { data: clients } = await db.from('clients').select('id, name').limit(50)
  const yellow = (clients ?? []).find((c) => /yellow/i.test(String(c.name)))
  const others = (clients ?? []).filter((c) => c.id !== yellow?.id).slice(0, 3)
  const collabClient = (i: number) => (others[i % Math.max(1, others.length)]?.id as string | undefined) ?? (yellow?.id as string | undefined) ?? null
  let skipped268 = false
  for (const ex of EX) {
    const { data: vendor, error } = await db.from('vendors').upsert({ slug: ex.slug, name: ex.name, vendor_type: 'individual', bookable: true, verified: false, tier: 'free', is_apnosh: false, service_area: ['WA'], craft: ex.craft, crafts: ['social'], description: ex.description, avg_rating: ex.avg_rating, total_bookings: ex.total_bookings }, { onConflict: 'slug' }).select('id').maybeSingle()
    if (error || !vendor) { console.error('vendor', ex.slug, error?.message); continue }
    const vid = vendor.id as string
    await db.from('vendor_listings').delete().eq('vendor_id', vid)
    for (const pkg of ex.packages) { const { error: le } = await db.from('vendor_listings').upsert(packageToRow(pkg, vid), { onConflict: 'vendor_id,slug' }); if (le) console.error('listing', pkg.slug, le.message) }
    /* calendar: request or instant, evenings and weekend lunches */
    const { data: rule } = await db.from('availability_rules').select('id').eq('scope_kind', 'vendor').eq('scope_id', vid).maybeSingle()
    const ruleRow = { gate_kind: 'shoot', scope_kind: 'vendor', scope_id: vid, label: `confirm:${ex.confirm}`, timezone: 'America/Los_Angeles', weekly: ex.weekly, exceptions: {}, slot_minutes: 90, capacity: 1, lead_time_days: 3, horizon_days: 45, active: true, updated_at: new Date().toISOString() }
    if (rule) await db.from('availability_rules').update(ruleRow).eq('id', rule.id); else await db.from('availability_rules').insert(ruleRow)
    /* reviews */
    await db.from('work_ratings').delete().eq('creator_id', vid)
    for (const [i, r] of ex.reviews.entries()) await db.from('work_ratings').insert({ creator_id: vid, client_id: collabClient(i), stars: r.stars, comment: r.comment, created_at: new Date(Date.now() - r.daysAgo * 86400000).toISOString() })
    /* audience + posts (268) */
    const { error: ae } = await db.from('creator_audience').upsert({ vendor_id: vid, ...ex.audience, updated_at: new Date().toISOString() }, { onConflict: 'vendor_id' })
    if (ae) { skipped268 = true; console.log('audience skipped for', ex.slug, '-', ae.message); }
    else {
      await db.from('creator_posts').delete().eq('vendor_id', vid)
      for (const [i, p] of ex.posts.entries()) {
        const { listing, ...rest } = p as typeof p & { listing?: string }
        const { error: pe } = await db.from('creator_posts').insert({ vendor_id: vid, client_id: p.kind === 'collab' ? collabClient(i) : null, ...rest, url: p.url ?? null, note: p.kind === 'collab' ? [listing, p.note].filter(Boolean).join(' · ') : null })
        if (pe) console.error('post', pe.message)
      }
    }
    console.log('seeded', ex.slug, vid)
  }
  if (skipped268) console.log('\nRun supabase/migrations/268_influencers.sql, then run this again for the audience and posts.')
}
main().catch((e) => { console.error(e); process.exit(1) })
