/**
 * CREATOR SCREENS e2e — does it actually SHOW UP for them?
 *
 * `creator-journey.ts` proves the plumbing: a booking becomes work, filed under the right id, paid
 * out correctly. This one proves the part a creator would actually notice — that the work appears on
 * the screens they open. It seeds a real creator with a real booked job, signs in AS them (a real
 * @supabase/ssr session cookie, same library the app uses), then fetches the ACTUAL running pages and
 * asserts their own data is in what comes back.
 *
 * Server-rendered pages are asserted on their HTML. Client-rendered pages (which fetch after mount)
 * are asserted on the API that feeds them, plus a 200 on the page itself — so a green run means the
 * data is really reaching the screen, not that a shell rendered.
 *
 * Prereq: the dev server. Everything else it seeds and cleans up itself.
 *   npm run dev
 *   npx tsx --tsconfig scripts/sim/tsconfig.json scripts/sim/creator-screens.ts
 */
import { config } from 'dotenv'
import { createClient as createJsClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { createAdminClient } from '@/lib/supabase/admin'
import { onboardCreatorCore } from '@/lib/marketplace/onboard-creator'
import { emptyPackage, packageToRow } from '@/lib/marketplace/package'
import { getVendorScheduleBySlug, confirmLabel, CREATOR_GATE_KIND } from '@/lib/marketplace/creator-schedule'
import { mintBookingWorkOrder } from '@/lib/marketplace/booking-work-order'
import { Suite } from './lib'

config({ path: '.env.local' })

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const TEST_CLIENT = '2535fe50-0d78-411f-a59f-cfffbbd239b5'
const STAMP = Date.now()
const EMAIL = `sim-screens-${STAMP}@apnosh-sim.invalid`
const PASSWORD = `Sim!${STAMP}aA`
const NAME = `SIMSCREENS Rivera ${STAMP}`
const OFFER_TITLE = `SIMSCREENS Tasting Menu Shoot ${STAMP}`
const DISH_ANSWER = 'SIMSCREENSDISH the uni toast'

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/** Sign in as this creator and mint the cookie header the dev server will accept. */
async function sessionCookie(): Promise<string | null> {
  const js = createJsClient(URL_, ANON)
  const { data, error } = await js.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
  if (error || !data.session) { console.error('sign-in failed:', error?.message); return null }
  const jar: Record<string, string> = {}
  const ssr = createServerClient(URL_, ANON, {
    cookies: {
      getAll: () => Object.entries(jar).map(([name, value]) => ({ name, value })),
      setAll: (list) => { for (const { name, value } of list) jar[name] = value },
    },
  })
  await ssr.auth.setSession({ access_token: data.session.access_token, refresh_token: data.session.refresh_token })
  return Object.entries(jar).map(([n, v]) => `${n}=${v}`).join('; ')
}

async function getPage(path: string, cookie?: string): Promise<{ status: number; body: string }> {
  const r = await fetch(`${BASE}${path}`, { headers: cookie ? { cookie } : {}, redirect: 'manual' })
  return { status: r.status, body: await r.text().catch(() => '') }
}

/** HTML-decode enough to match text that React escaped (apostrophes, ampersands). */
const norm = (s: string) => s.replace(/&#x27;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x2F;/g, '/')

async function main() {
  const a = createAdminClient()
  const s = new Suite()
  let userId: string | null = null
  let vendorId: string | null = null
  let slug = ''
  let bookingId: string | null = null

  const reachable = await fetch(BASE).then(() => true).catch(() => false)
  if (!reachable) { console.error(`\nDev server not reachable at ${BASE}. Start it with: npm run dev\n`); process.exit(1) }

  try {
    // ── seed a creator with a real booked job ────────────────────────────────
    const { data: created, error: authErr } = await a.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true })
    if (authErr || !created.user) throw new Error(`could not create the test login: ${authErr?.message}`)
    userId = created.user.id

    const onboard = await onboardCreatorCore({
      name: NAME, email: EMAIL, craft: 'Photo', crafts: ['photo'], serviceArea: ['WA'],
      description: 'Simulated creator for a screen test. Safe to delete.',
      personId: userId, invite: false, bookable: true,
    })
    if (!onboard.ok || !onboard.vendorId) throw new Error('onboarding failed')
    vendorId = onboard.vendorId
    slug = onboard.slug!

    const allWeek = { start: '09:00', end: '17:00' }
    const { data: rule } = await a.from('availability_rules').insert({
      gate_kind: CREATOR_GATE_KIND, scope_kind: 'vendor', scope_id: vendorId, label: confirmLabel('request'),
      timezone: 'America/Los_Angeles',
      weekly: { '0': [allWeek], '1': [allWeek], '2': [allWeek], '3': [allWeek], '4': [allWeek], '5': [allWeek], '6': [allWeek] },
      slot_minutes: 120, capacity: 1, lead_time_days: 1, horizon_days: 45, active: true,
      created_by: userId, updated_at: new Date().toISOString(),
    }).select('id').single()
    const ruleId = rule!.id as string

    const pkg = {
      ...emptyPackage('photographer'),
      slug: `simscreens-shoot-${STAMP}`, title: OFFER_TITLE,
      description: 'A tasting-menu shoot at your restaurant.',
      priceCents: 82500, deliverables: ['25 edited photos'],
      intake: [{ id: 'q1', label: 'Which dishes should we feature?', required: true }],
      bookingShape: 'scheduled' as const, active: true,
    }
    const { data: listing } = await a.from('vendor_listings').upsert(packageToRow(pkg, vendorId), { onConflict: 'vendor_id,slug' }).select('id').single()
    const listingId = listing!.id as string

    const sched = await getVendorScheduleBySlug(slug)
    const pick = sched.slots[0]
    const meta = {
      kind: 'creator', vendorId, vendorSlug: slug, listingId, listingSlug: pkg.slug, listingTitle: OFFER_TITLE,
      tierName: null, intake: { 'Which dishes should we feature?': DISH_ANSWER },
    }
    const { data: bk } = await a.from('bookings').insert({
      client_id: TEST_CLIENT, gate_kind: CREATOR_GATE_KIND, rule_id: ruleId,
      slot_date: pick.date, slot_start: pick.start, slot_end: pick.end, timezone: pick.timezone,
      status: 'confirmed', note: JSON.stringify(meta), updated_at: new Date().toISOString(),
    }).select('id').single()
    bookingId = bk!.id as string
    const orderId = await mintBookingWorkOrder(bookingId)
    if (!orderId) throw new Error('the booking did not mint work — cannot test the screens')

    const cookie = await sessionCookie()
    if (!cookie) throw new Error('could not sign in as the seeded creator')

    // ── the screens ──────────────────────────────────────────────────────────
    s.group('signed out — their work is not public')
    const anonWork = await getPage('/creator/work')
    s.check('a stranger cannot open their work screen', anonWork.status === 307 || anonWork.status === 302 || anonWork.status === 401, `status ${anonWork.status}`)
    const anonApi = await fetch(`${BASE}/api/creator/me`)
    s.check('their work data is not readable signed out', anonApi.status === 401, `status ${anonApi.status}`)

    s.group('their work screen')
    const work = await getPage('/creator/work', cookie)
    s.check('the work screen opens', work.status === 200, `status ${work.status}`)
    const meRes = await fetch(`${BASE}/api/creator/me`, { headers: { cookie } })
    const me = await meRes.json().catch(() => ({} as Record<string, unknown>))
    s.check('it knows who they are', me.creatorId === vendorId, `${me.creatorId}`)
    const orders = (me.orders ?? []) as { id: string; title: string; status: string; amount_cents?: number }[]
    const mine = orders.find((o) => o.id === orderId)
    s.check('their booked job is in the list', !!mine, `${orders.length} orders back`)
    s.check('the job is named after what was booked', !!mine && mine.title.includes('Tasting Menu Shoot'), mine?.title)
    s.check('the job is theirs to start', mine?.status === 'accepted', mine?.status)
    const cal = (me.calendar ?? []) as { id: string; time: string | null; bookingId: string | null }[]
    s.check('it is on the calendar feed with a real time', cal.some((c) => c.id === orderId && c.time === pick.start), JSON.stringify(cal.slice(0, 2)))
    s.check('their earnings are reported', me.earnings !== undefined)

    s.group('their bookings screen')
    const bookings = await getPage('/creator/bookings', cookie)
    s.check('the bookings screen opens', bookings.status === 200, `status ${bookings.status}`)
    const bh = norm(bookings.body)
    s.check('it shows the booked offer by name', bh.includes(OFFER_TITLE) || bh.includes('Tasting Menu Shoot'))
    s.check('it shows their calendar', /Your calendar/i.test(bh))

    s.group('the booking detail screen')
    const detail = await getPage(`/creator/bookings/${bookingId}`, cookie)
    s.check('the booking opens', detail.status === 200, `status ${detail.status}`)
    const dh = norm(detail.body)
    s.check('it names the restaurant', /Do Si/i.test(dh), 'expected the booking restaurant name')
    s.check("it shows the restaurant's answer to their question", dh.includes(DISH_ANSWER))
    s.check('it shows what they will be paid', dh.includes('825') || dh.includes('$825'))
    s.check('it shows the day of the shoot', dh.includes(String(new Date(`${pick.date}T00:00:00Z`).getUTCDate())))

    s.group("another creator's booking is private")
    const { data: otherUser } = await a.auth.admin.createUser({ email: `sim-other-${STAMP}@apnosh-sim.invalid`, password: PASSWORD, email_confirm: true })
    const otherOnboard = await onboardCreatorCore({
      name: `SIMSCREENS Other ${STAMP}`, email: `sim-other-${STAMP}@apnosh-sim.invalid`, craft: 'Photo',
      serviceArea: ['WA'], personId: otherUser!.user!.id, invite: false, bookable: true,
    })
    const otherJs = createJsClient(URL_, ANON)
    const otherSess = await otherJs.auth.signInWithPassword({ email: `sim-other-${STAMP}@apnosh-sim.invalid`, password: PASSWORD })
    const jar2: Record<string, string> = {}
    const ssr2 = createServerClient(URL_, ANON, {
      cookies: { getAll: () => Object.entries(jar2).map(([name, value]) => ({ name, value })), setAll: (l) => { for (const { name, value } of l) jar2[name] = value } },
    })
    await ssr2.auth.setSession({ access_token: otherSess.data.session!.access_token, refresh_token: otherSess.data.session!.refresh_token })
    const otherCookie = Object.entries(jar2).map(([n, v]) => `${n}=${v}`).join('; ')
    const peek = await getPage(`/creator/bookings/${bookingId}`, otherCookie)
    const ph = norm(peek.body)
    s.check("a different creator cannot read the answers on someone else's booking", !ph.includes(DISH_ANSWER), `status ${peek.status}`)
    // cleanup the second creator inline
    if (otherOnboard.vendorId) await a.from('vendors').delete().eq('id', otherOnboard.vendorId)
    await a.from('creator_logins').delete().eq('person_id', otherUser!.user!.id)
    await a.auth.admin.deleteUser(otherUser!.user!.id).catch(() => {})

    s.group('their shop editor')
    const store = await getPage('/creator/storefront', cookie)
    s.check('the shop editor opens', store.status === 200, `status ${store.status}`)
    s.check('it shows the offer they published', norm(store.body).includes(OFFER_TITLE) || norm(store.body).includes('Tasting Menu Shoot'))

    s.group('their other screens')
    for (const [label, path] of [['earnings', '/creator/earnings'], ['hours', '/creator/availability'], ['account', '/creator/account'], ['profile', '/creator/account/profile'], ['case studies', '/creator/account/portfolio']] as const) {
      const r = await getPage(path, cookie)
      s.check(`their ${label} screen opens`, r.status === 200, `status ${r.status} at ${path}`)
    }
    const earn = await getPage('/creator/earnings', cookie)
    s.check('earnings shows a real balance, not a crash', /\$\s?0|\$[\d,]+/.test(norm(earn.body)))

    s.group('their public shop, as a restaurant sees it')
    const shop = await getPage(`/marketplace/${slug}`, cookie)
    s.check('their shop page opens', shop.status === 200, `status ${shop.status}`)
    const sh = norm(shop.body)
    s.check('it shows their name', sh.includes(NAME) || sh.includes('SIMSCREENS Rivera'))
    s.check('it shows their offer', sh.includes(OFFER_TITLE) || sh.includes('Tasting Menu Shoot'))
    s.check('it shows their price', sh.includes('825'))
    s.check('a restaurant can start a booking from it', /book|request|pick a time/i.test(sh))
  } finally {
    const admin = createAdminClient()
    if (vendorId) {
      const { data: orders } = await admin.from('creator_work_orders').select('id').eq('creator_id', vendorId)
      const ids = (orders ?? []).map((o) => o.id as string)
      if (ids.length) {
        await admin.from('creator_payouts').delete().in('work_order_id', ids)
        await admin.from('campaign_charges').delete().in('work_order_id', ids)
        await admin.from('creator_work_orders').delete().in('id', ids)
      }
      await admin.from('availability_rules').delete().eq('scope_kind', 'vendor').eq('scope_id', vendorId)
      await admin.from('vendor_listings').delete().eq('vendor_id', vendorId)
      await admin.from('vendors').delete().eq('id', vendorId)
    }
    if (bookingId) await admin.from('bookings').delete().eq('id', bookingId)
    if (userId) {
      await admin.from('creator_logins').delete().eq('person_id', userId)
      await admin.auth.admin.deleteUser(userId).catch(() => {})
    }
  }

  const ok = s.report('Creator screens — what they actually see, over the wire')
  process.exit(ok ? 0 : 1)
}

main().catch((e) => { console.error('FAIL', e); process.exit(1) })
