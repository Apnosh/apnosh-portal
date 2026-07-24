/**
 * DEMO CREATOR — a real, loggable-in creator account with work in every state, so the creator side
 * can be looked at (on a phone, in the browser) instead of only asserted in a test.
 *
 * The e2e sims create and destroy their own data in one run, which is right for a gate but leaves
 * nothing to LOOK at. This seeds a standing demo creator whose screens are full: a new request
 * waiting on their yes, an upcoming shoot, a piece delivered and awaiting the restaurant, and one
 * finished and paid. Idempotent — re-running refreshes the same account.
 *
 * No real money: payouts are internal ledger rows, exactly as in the sims. No Stripe call is made.
 *
 * HIDDEN FROM CLIENTS BY DEFAULT. This writes to the live database, so a bookable demo creator would
 * show up on the real store shelf and a restaurant could book someone who does not exist. The account
 * is seeded `bookable = false`: the owner can still sign in and walk every creator screen, but no
 * client can see or book them. Pass --live only when the shop page itself is what needs looking at,
 * and take it down afterwards.
 *
 *   npx tsx --tsconfig scripts/sim/tsconfig.json scripts/sim/creator-demo-seed.ts
 *   npx tsx --tsconfig scripts/sim/tsconfig.json scripts/sim/creator-demo-seed.ts --live
 *   npx tsx --tsconfig scripts/sim/tsconfig.json scripts/sim/creator-demo-seed.ts --clean
 */
import { config } from 'dotenv'
import { createAdminClient } from '@/lib/supabase/admin'
import { onboardCreatorCore } from '@/lib/marketplace/onboard-creator'
import { emptyPackage, packageToRow, type CreatorPackage } from '@/lib/marketplace/package'
import { getVendorSchedule, confirmLabel, CREATOR_GATE_KIND } from '@/lib/marketplace/creator-schedule'
import { mintBookingWorkOrder } from '@/lib/marketplace/booking-work-order'
import { updateWorkOrder } from '@/lib/campaigns/work-orders'

config({ path: '.env.local' })

const EMAIL = process.env.DEMO_CREATOR_EMAIL || 'demo.creator@apnosh-demo.com'
const PASSWORD = process.env.DEMO_CREATOR_PASSWORD || 'DemoCreator!2026'
const NAME = 'Sam Rivera'
const SLUG_HINT = 'sam-rivera'
const TEST_CLIENT = '2535fe50-0d78-411f-a59f-cfffbbd239b5'   // Do Si KBBQ — the standing demo restaurant

type Admin = ReturnType<typeof createAdminClient>
const isoIn = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10)

const OFFERS: CreatorPackage[] = [
  {
    ...emptyPackage('photographer'),
    slug: 'menu-photo-day', title: 'Menu Photo Day',
    description: 'A half day at your restaurant shooting your menu, styled and edited.',
    priceCents: 85000, deliverables: ['25 edited photos', 'Web + print sizes'],
    options: [{ id: 'o1', label: 'Extra hour on site', priceDeltaCents: 15000 }, { id: 'o2', label: 'Rush edit (3 days)', priceDeltaCents: 20000 }],
    intake: [
      { id: 'q1', label: 'Which dishes should we feature?', required: true },
      { id: 'q2', label: 'Any dishes to avoid?', hint: 'Things off the menu soon' },
    ],
    bookingShape: 'scheduled', slotMinutes: 240, active: true,
  },
  {
    ...emptyPackage('videographer'),
    slug: 'reel-pack', title: 'Reel Pack',
    description: 'Three short vertical videos shot in one visit, delivered over two weeks.',
    priceCents: 120000, deliverables: [], categories: ['videographer', 'food_influencer'],
    tiers: [
      { id: 't1', name: '3 reels', priceCents: 120000, deliverables: ['3 vertical reels', 'Captions'] },
      { id: 't2', name: '5 reels', priceCents: 180000, deliverables: ['5 vertical reels', 'Captions', '1 hero cut'] },
    ],
    intake: [{ id: 'q1', label: 'What should the reels be about?', required: true }],
    deliveries: [
      { id: 'd1', label: 'Reel 1' },
      { id: 'd2', label: 'Reel 2', offsetDays: 7 },
      { id: 'd3', label: 'Reel 3', offsetDays: 14 },
    ],
    bookingShape: 'scheduled', slotMinutes: 180, active: true,
  },
  {
    ...emptyPackage('social_manager'),
    slug: 'monthly-social', title: 'Monthly Social',
    description: 'I run your Instagram for the month: planning, posting, and replies.',
    priceCents: 90000, deliverables: ['12 posts a month', 'Replies handled'],
    intake: [{ id: 'q1', label: 'What should we post about this month?' }],
    bookingShape: 'recurring', listingType: 'subscription', billingPeriod: 'monthly', active: true,
  },
]

async function wipe(a: Admin): Promise<string | null> {
  const { data: v } = await a.from('vendors').select('id').eq('slug', SLUG_HINT).maybeSingle()
  const vendorId = (v?.id as string) ?? null
  if (vendorId) {
    const { data: orders } = await a.from('creator_work_orders').select('id').eq('creator_id', vendorId)
    const ids = (orders ?? []).map((o) => o.id as string)
    if (ids.length) {
      await a.from('creator_payouts').delete().in('work_order_id', ids)
      await a.from('campaign_charges').delete().in('work_order_id', ids)
      await a.from('creator_work_orders').delete().in('id', ids)
    }
    const { data: rules } = await a.from('availability_rules').select('id').eq('scope_kind', 'vendor').eq('scope_id', vendorId)
    const ruleIds = (rules ?? []).map((r) => r.id as string)
    if (ruleIds.length) await a.from('bookings').delete().in('rule_id', ruleIds)
    await a.from('bookings').delete().eq('client_id', TEST_CLIENT).like('note', `%"vendorSlug":"${SLUG_HINT}"%`)
    await a.from('availability_rules').delete().eq('scope_kind', 'vendor').eq('scope_id', vendorId)
    await a.from('vendor_listings').delete().eq('vendor_id', vendorId)
  }
  return vendorId
}

async function book(a: Admin, meta: Record<string, unknown>, row: Record<string, unknown>): Promise<string> {
  const { data, error } = await a.from('bookings').insert({
    client_id: TEST_CLIENT, gate_kind: CREATOR_GATE_KIND, timezone: 'America/Los_Angeles',
    note: JSON.stringify({ kind: 'creator', ...meta }), updated_at: new Date().toISOString(), ...row,
  }).select('id').single()
  if (error) throw new Error(`book: ${error.message}`)
  return data.id as string
}

async function main() {
  const a = createAdminClient()
  const clean = process.argv.includes('--clean')
  const live = process.argv.includes('--live')   // opt in to being visible on the real store shelf

  // Find or make the login.
  let userId: string | null = null
  const { data: list } = await a.auth.admin.listUsers({ page: 1, perPage: 1000 })
  userId = list?.users.find((u) => u.email?.toLowerCase() === EMAIL.toLowerCase())?.id ?? null

  if (clean) {
    const vendorId = await wipe(a)
    if (vendorId) await a.from('vendors').delete().eq('id', vendorId)
    if (userId) {
      await a.from('creator_logins').delete().eq('person_id', userId)
      await a.auth.admin.deleteUser(userId).catch(() => {})
    }
    console.log('Demo creator removed.')
    return
  }

  if (!userId) {
    const { data: created, error } = await a.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true })
    if (error || !created.user) throw new Error(`could not create the demo login: ${error?.message}`)
    userId = created.user.id
  } else {
    await a.auth.admin.updateUserById(userId, { password: PASSWORD, email_confirm: true })
  }

  await wipe(a)   // clear old demo work, keep the account

  const onboard = await onboardCreatorCore({
    name: NAME, email: EMAIL, craft: 'Photo', crafts: ['photo', 'video', 'social'],
    styleTags: ['Warm + natural light', 'Fast turnaround'],
    serviceArea: ['WA'], description: 'Food photographer and video maker in Seattle. I shoot menus, reels, and run social for a handful of restaurants.',
    personId: userId, invite: false, bookable: live,
  })
  if (!onboard.ok || !onboard.vendorId) throw new Error(`onboarding failed: ${JSON.stringify(onboard)}`)
  const vendorId = onboard.vendorId
  const slug = onboard.slug!
  // onboardCreatorCore deliberately never demotes an existing creator, so a re-run has to set this
  // itself — otherwise a once-live demo account stays on the shelf forever.
  await a.from('vendors').update({ bookable: live }).eq('id', vendorId)

  // Hours: weekdays 9-5, confirms each booking.
  const wk = { start: '09:00', end: '17:00' }
  const { data: rule } = await a.from('availability_rules').insert({
    gate_kind: CREATOR_GATE_KIND, scope_kind: 'vendor', scope_id: vendorId, label: confirmLabel('request'),
    timezone: 'America/Los_Angeles',
    weekly: { '1': [wk], '2': [wk], '3': [wk], '4': [wk], '5': [wk] },
    slot_minutes: 120, capacity: 1, lead_time_days: 1, horizon_days: 60, active: true,
    created_by: userId, updated_at: new Date().toISOString(),
  }).select('id').single()
  const ruleId = rule!.id as string

  const listingIds: Record<string, string> = {}
  for (const pkg of OFFERS) {
    const { data, error } = await a.from('vendor_listings').upsert(packageToRow(pkg, vendorId), { onConflict: 'vendor_id,slug' }).select('id').single()
    if (error) throw new Error(`offer ${pkg.slug}: ${error.message}`)
    listingIds[pkg.slug] = data.id as string
  }

  // By vendor id, not slug: the by-slug reader is the PUBLIC path and refuses a non-bookable
  // creator, which a hidden demo account is by default.
  const sched = await getVendorSchedule(vendorId, undefined, 200, 240)
  if (sched.slots.length < 3) throw new Error('not enough open times to seed bookings')
  const metaFor = (p: CreatorPackage, intake: Record<string, string>, extra: Record<string, unknown> = {}) => ({
    vendorId, vendorSlug: slug, listingId: listingIds[p.slug], listingSlug: p.slug, listingTitle: p.title,
    tierName: null, intake, ...extra,
  })

  // ① A new request, waiting on their yes.
  const s0 = sched.slots[0]
  await book(a, metaFor(OFFERS[0], { 'Which dishes should we feature?': 'The short rib, the kimchi pancake, and the soft serve' }), {
    rule_id: ruleId, slot_date: s0.date, slot_start: s0.start, slot_end: s0.end,
    status: 'held', hold_expires_at: new Date(Date.now() + 36 * 3600_000).toISOString(),
  })

  // ② An upcoming shoot they already said yes to.
  const s1 = sched.slots[1]
  const b1 = await book(a, metaFor(OFFERS[0], { 'Which dishes should we feature?': 'The new spring menu', 'Any dishes to avoid?': 'Nothing off the winter menu' }, {
    options: [{ label: 'Extra hour on site', priceDeltaCents: 15000 }],
  }), { rule_id: ruleId, slot_date: s1.date, slot_start: s1.start, slot_end: s1.end, status: 'confirmed' })
  await mintBookingWorkOrder(b1)

  // ③ A reel pack in progress: three pieces, one already handed over and awaiting the restaurant.
  const s2 = sched.slots[2]
  const b2 = await book(a, metaFor(OFFERS[1], { 'What should the reels be about?': 'The chef, the grill, and one dish start to finish' }), {
    rule_id: ruleId, slot_date: s2.date, slot_start: s2.start, slot_end: s2.end, status: 'confirmed',
  })
  await mintBookingWorkOrder(b2)
  const { data: reelRows } = await a.from('creator_work_orders').select('id, due_date').like('campaign_piece_key', `booking:${b2}%`).order('due_date', { ascending: true })
  if (reelRows?.[0]) {
    await updateWorkOrder(reelRows[0].id as string, { status: 'in_progress' })
    await updateWorkOrder(reelRows[0].id as string, { status: 'delivered', delivered_url: 'https://example.com/reel-1-cut' })
  }

  // ④ A finished, approved, paid-out job — so the earnings screen has something real in it.
  const b3 = await book(a, metaFor(OFFERS[0], { 'Which dishes should we feature?': 'The whole lunch menu' }), {
    rule_id: ruleId, slot_date: isoIn(-21), slot_start: '09:00', slot_end: '13:00', status: 'confirmed',
  })
  const doneId = await mintBookingWorkOrder(b3)
  if (doneId) {
    await updateWorkOrder(doneId, { status: 'in_progress' })
    await updateWorkOrder(doneId, { status: 'delivered', delivered_url: 'https://example.com/lunch-menu-gallery' })
    await updateWorkOrder(doneId, { status: 'approved' })
  }

  const { data: payouts } = await a.from('creator_payouts').select('net_cents').eq('creator_id', vendorId)
  const owed = (payouts ?? []).reduce((t, p) => t + ((p.net_cents as number) ?? 0), 0)

  console.log(`
┌─ Demo creator is ready ────────────────────────────────────
│  Sign in at  /login
│    email     ${EMAIL}
│    password  ${PASSWORD}
│
│  Their work      /creator/work
│  Their bookings  /creator/bookings
│  Their earnings  /creator/earnings
│  Their shop      /marketplace/${slug}${live ? '' : '   (hidden until --live)'}
│
│  Seeded: 3 offers · 1 request awaiting their yes · 1 upcoming shoot
│          1 reel delivered awaiting the restaurant · 1 finished + paid
│          $${(owed / 100).toLocaleString()} showing as earned (ledger only, no real money)
│
│  ${live
    ? 'VISIBLE TO CLIENTS. They are on the real store shelf and can be\n│  booked by a restaurant. Take them down when you are done looking.'
    : 'Hidden from clients. You can walk every creator screen; no restaurant\n│  can see or book them. Pass --live to put the shop page on the shelf.'}
│
│  Remove it:  npx tsx --tsconfig scripts/sim/tsconfig.json \\
│                scripts/sim/creator-demo-seed.ts --clean
└────────────────────────────────────────────────────────────`)
}

main().catch((e) => { console.error('FAIL', e); process.exit(1) })
