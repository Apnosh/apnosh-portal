/**
 * GET  /api/dashboard/more?clientId=…  — everything the More tab shows about this business:
 *      the profile facts (logo, cuisine, city, hours, goals), the owner's settings
 *      (approve-first, favorites), the people they have worked with, delivered work still
 *      waiting for a rating, how many counted promises are on their wins shelf, and the LIVE
 *      VALUE behind each row on the hub (2026-09-08) — the login email, the Google listing's
 *      own name and links, how many accounts are connected, and the counts behind Your team,
 *      Your requests, Your bookings and Guest list.
 *
 *      EVERY ONE OF THOSE EXTRA READS IS BEST-EFFORT AND ITS OWN. A missing column (42703) or a
 *      missing table or relationship (PGRST200 / 42P01) leaves ONE row without a sub-line; it
 *      never takes the hub down and never takes the profile down with it, because an owner who
 *      cannot load a count still needs every door on this page and the way out.
 * POST /api/dashboard/more            — { clientId, approveFirst?, favorites? } saves those
 *      two settings. Favorites live in businesses.preferences (jsonb), approve-first in
 *      businesses.approval_preferences.auto_approve (the same flag the old Settings toggle
 *      wrote), so nothing needs a migration.
 * PATCH /api/dashboard/more            — { clientId, language } saves the one CLIENT-row
 *      setting the owner controls: clients.preferred_language (migration 259). Its own verb
 *      because it writes a different table than POST does, and its own whitelist because a
 *      body key that is not on the list must never reach an update on the clients row.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { getActiveClientGoals, getGoalsCatalog } from '@/lib/goals/queries'
import { getRatingsForOrders } from '@/lib/campaigns/work-ratings'
import { creatorNamesByIds } from '@/lib/campaigns/vendor-supply'
import { isLang } from '@/lib/i18n/t'
import { getClientLanguage } from '@/lib/i18n/language'
import { WIN_TYPE } from '@/lib/love/win'
import { referralsEnabled } from '@/lib/referral-gate'
import { hasCountedPromise } from '@/lib/referrals/server'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Which channels count as "a social account is connected" on the hub's status tile. */
const SOCIAL_CHANNELS = new Set(['instagram', 'facebook', 'tiktok', 'linkedin', 'youtube', 'zernio', 'ayrshare'])

/** The links a Google listing carries, as the business-info editor writes them. */
interface ListingLinks { ordering?: unknown[]; reservations?: unknown[]; social?: Record<string, unknown> }

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })
  const access = await checkClientAccess(clientId)
  if (!access.authorized) return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status: access.reason === 'unauthenticated' ? 401 : 403 })

  const admin = createAdminClient()

  /* ── THE SUB-LINES ────────────────────────────────────────────────────────────────────────────
   * The hub's grammar is business-info's: a row previews what it holds, so the owner can read the
   * page without opening anything. These are the reads behind those previews. They are started
   * here so they run beside the block below rather than after it, and every one of them answers
   * `null` — "we could not read it" — instead of throwing, because the sub-line is the ONE part of
   * a row that is allowed to be missing. A null shows no sub-line at all; it never shows a
   * placeholder, and it never shows a zero we are not sure about. */
  const extras = Promise.all([
    // the login email, for the "Your login" row. profiles.email may simply not be filled in.
    access.userId
      ? admin.from('profiles').select('email').eq('id', access.userId).maybeSingle()
        .then((r) => (r.error ? null : ((r.data?.email as string | null) ?? null)), () => null)
      : Promise.resolve(null),
    // The listing's own name and the links on it (order buttons, social profiles). Deliberately a
    // SECOND read of gbp_locations rather than three more columns on the one below: PostgREST
    // fails the whole select on one unknown column, and hours and address must not be lost to a
    // column that only decorates a row.
    admin.from('gbp_locations').select('location_name, store_code, links').eq('client_id', clientId).limit(1).maybeSingle()
      .then((r) => (r.error ? null : (r.data as { location_name: string | null; store_code: string | null; links: ListingLinks | null } | null)), () => null),
    // every account this client has linked, so the hub can say how many and which kinds
    admin.from('channel_connections').select('channel, status').eq('client_id', clientId)
      .then((r) => (r.error ? null : ((r.data ?? []) as Array<{ channel: string | null; status: string | null }>)), () => null),
    // who is on their team. One row per capability, so the people are de-duped below.
    admin.from('role_assignments').select('person_id').eq('client_id', clientId)
      .is('ended_at', null).neq('scope', 'global').not('role', 'in', '(client_owner,client_manager)')
      .then((r) => (r.error ? null : ((r.data ?? []) as Array<{ person_id: string | null }>)), () => null),
    // the request desk
    admin.from('creative_requests').select('id', { count: 'exact', head: true }).eq('client_id', clientId)
      .then((r) => (r.error ? null : (r.count ?? 0)), () => null),
    // creator bookings still ahead of them, read the same way /dashboard/bookings reads them
    admin.from('bookings').select('id', { count: 'exact', head: true }).eq('client_id', clientId)
      .like('note', '%"kind":"creator"%').in('status', ['held', 'confirmed', 'needs_reschedule'])
      .then((r) => (r.error ? null : (r.count ?? 0)), () => null),
    // the guest list, minus the people who left. They stay in the table and are never emailed
    // again, so counting them would tell the owner they have an audience they do not have.
    admin.from('guest_contacts').select('id', { count: 'exact', head: true }).eq('client_id', clientId).is('unsubscribed_at', null)
      .then((r) => (r.error ? null : (r.count ?? 0)), () => null),
    // when the newest win landed, so the Wins row can say the month
    admin.from('proof_cards').select('fired_at').eq('client_id', clientId).eq('card_type', WIN_TYPE).eq('is_sample', false)
      .order('fired_at', { ascending: false }).limit(1).maybeSingle()
      .then((r) => (r.error ? null : ((r.data?.fired_at as string | null) ?? null)), () => null),
    // Whether Tell a friend has a door at all: the switch, then the one law — we do not ask an
    // owner to vouch for us before we have kept a promise to them. Read-only on purpose; minting
    // their code is the referral page's job, not a side effect of opening a hub.
    (referralsEnabled() ? hasCountedPromise(clientId).catch(() => false) : Promise.resolve(false)),
  ])

  const [client, biz, gbp, goals, catalog, orders, language, wins] = await Promise.all([
    // The three columns this screen has always read, and NOT preferred_language: PostgREST
    // fails a select on the name of a column that is not there, so asking for it here would
    // take the whole row down (name, city and tier included) on any database where migration
    // 259 has not run yet. The language comes from its own guarded read below.
    admin.from('clients').select('name, location, tier').eq('id', clientId).maybeSingle(),
    admin.from('businesses').select('logo_url, cuisine, cuisine_other, preferences, approval_preferences').eq('client_id', clientId).maybeSingle(),
    admin.from('gbp_locations').select('hours, address').eq('client_id', clientId).limit(1).maybeSingle(),
    getActiveClientGoals(clientId).catch(() => []),
    getGoalsCatalog().catch(() => []),
    admin.from('work_orders').select('id, title, discipline, creator_id, status, updated_at, campaign_id').eq('client_id', clientId).in('status', ['delivered', 'approved']).order('updated_at', { ascending: false }).limit(60),
    getClientLanguage(clientId),
    // HOW MANY COUNTED PROMISES THIS OWNER HAS. The wins shelf is only worth a row on this hub
    // when there is something on it — before the first count it is an empty page. Seeded samples
    // do not count: they are never wins (src/lib/love/win.ts). Best-effort, because the table
    // (249) and the type (262) may not be there yet; nought means the row simply does not show.
    admin.from('proof_cards').select('id', { count: 'exact', head: true })
      .eq('client_id', clientId).eq('card_type', WIN_TYPE).eq('is_sample', false)
      .then((r) => r.count ?? 0, () => 0),
  ])

  const prefs = (biz.data?.preferences as Record<string, unknown> | null) ?? {}
  const approval = (biz.data?.approval_preferences as Record<string, unknown> | null) ?? {}
  const favorites = Array.isArray(prefs.favorites) ? (prefs.favorites as string[]).filter((x) => typeof x === 'string') : []
  const cuisineRaw = (biz.data?.cuisine as string | null) ?? ''
  const cuisine = /other/i.test(cuisineRaw) ? ((biz.data?.cuisine_other as string | null) ?? '') : cuisineRaw
  const address = (gbp.data?.address as Record<string, unknown> | null) ?? null
  const city = (address && typeof address.city === 'string' ? address.city : null) ?? (address && typeof address.locality === 'string' ? address.locality : null) ?? (client.data?.location as string | null) ?? null

  // people: every real creator (vendor UUID) who delivered for this client, newest first
  const rows = (orders.data ?? []) as Array<{ id: string; title: string; discipline: string; creator_id: string; status: string; updated_at: string; campaign_id: string | null }>
  const real = rows.filter((r) => UUID.test(r.creator_id ?? ''))
  const names = await creatorNamesByIds(real.map((r) => r.creator_id)).catch(() => new Map<string, string>())
  const rated = await getRatingsForOrders(real.map((r) => r.id)).catch(() => new Map())
  const toRate = real.filter((r) => !rated.has(r.id)).map((r) => ({ id: r.id, title: r.title, discipline: r.discipline, creatorId: r.creator_id, creatorName: names.get(r.creator_id) ?? 'Your creator', deliveredAt: r.updated_at }))
  const peopleMap = new Map<string, { id: string; name: string; discipline: string; pieces: number; last: string }>()
  for (const r of real) {
    const p = peopleMap.get(r.creator_id)
    if (p) { p.pieces += 1 } else peopleMap.set(r.creator_id, { id: r.creator_id, name: names.get(r.creator_id) ?? 'Your creator', discipline: r.discipline, pieces: 1, last: r.updated_at })
  }
  // favorites the owner picked that have no delivered work yet still count as people
  for (const id of favorites) if (!peopleMap.has(id)) peopleMap.set(id, { id, name: names.get(id) ?? 'Your creator', discipline: '', pieces: 0, last: '' })

  const [email, listing, conns, teamRows, requests, bookings, guests, winsLatestAt, referral] = await extras
  const live = (conns ?? []).filter((c) => c.status === 'connected')
  const listingLinks = (listing?.links && typeof listing.links === 'object') ? listing.links : null

  return NextResponse.json({
    profile: {
      name: (client.data?.name as string | null) ?? 'Your restaurant',
      logoUrl: (biz.data?.logo_url as string | null) ?? null,
      cuisine: cuisine || null,
      city,
      tier: (client.data?.tier as string | null) ?? null,
      hours: (gbp.data?.hours as unknown) ?? null,
      goals: (goals as Array<{ goalSlug: string; priority: number }>).sort((a, b) => a.priority - b.priority).map((g) => ({ slug: g.goalSlug, name: (catalog as Array<{ slug: string; displayName: string }>).find((c) => c.slug === g.goalSlug)?.displayName ?? g.goalSlug })),
    },
    settings: { approveFirst: !(approval.auto_approve === true), favorites, language },
    wins: typeof wins === 'number' ? wins : 0,
    people: [...peopleMap.values()],
    toRate,

    /* ── the sub-lines. `null` anywhere here means "we could not read it", and the row says
     *    nothing rather than guessing a zero. ─────────────────────────────────────────────── */
    email,
    /** the Google listing: its own name, whether it is really linked, and the links on it */
    listing: listing
      ? {
        name: listing.location_name || null,
        connected: !!listing.store_code,
        orderLinks: (listingLinks?.ordering?.length ?? 0) + (listingLinks?.reservations?.length ?? 0),
        socialProfiles: Object.values(listingLinks?.social ?? {}).filter(Boolean).length,
      }
      : null,
    connections: conns
      ? {
        count: live.length,
        google: live.some((c) => c.channel === 'google_business_profile'),
        social: live.some((c) => SOCIAL_CHANNELS.has(c.channel ?? '')),
      }
      : null,
    team: teamRows ? new Set(teamRows.map((r) => r.person_id).filter(Boolean)).size : null,
    requests,
    bookings,
    guests,
    /** when the newest win fired, so the Wins row can name its month in the owner's own locale */
    winsLatestAt,
    /** the referral loop is open AND this owner has had a promise counted */
    referral: referral === true,
  }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { clientId?: string; approveFirst?: boolean; favorites?: string[] }
  if (!body.clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })
  const access = await checkClientAccess(body.clientId)
  if (!access.authorized) return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status: access.reason === 'unauthenticated' ? 401 : 403 })
  const admin = createAdminClient()
  const { data: biz } = await admin.from('businesses').select('id, preferences, approval_preferences').eq('client_id', body.clientId).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'no business' }, { status: 404 })
  const patch: Record<string, unknown> = {}
  if (typeof body.approveFirst === 'boolean') patch.approval_preferences = { ...((biz.approval_preferences as Record<string, unknown> | null) ?? {}), auto_approve: !body.approveFirst }
  if (Array.isArray(body.favorites)) patch.preferences = { ...((biz.preferences as Record<string, unknown> | null) ?? {}), favorites: body.favorites.filter((x) => typeof x === 'string').slice(0, 50) }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'nothing to save' }, { status: 400 })
  const { error } = await admin.from('businesses').update(patch).eq('id', biz.id as string)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

/**
 * The owner's language. One key, whitelisted: anything else in the body is ignored rather than
 * forwarded, so this can never become a way to write an arbitrary column on the clients row.
 *
 * Best-effort on a database where migration 259 has not run yet: the column is missing, we warn
 * and answer ok:false with a reason instead of 500-ing a settings screen. The owner keeps
 * English, which is what they were reading anyway.
 */
export async function PATCH(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { clientId?: string; language?: unknown }
  if (!body.clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })
  const access = await checkClientAccess(body.clientId)
  if (!access.authorized) return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status: access.reason === 'unauthenticated' ? 401 : 403 })

  // THE WHITELIST. One key, and its value must be one of the two the CHECK allows.
  if (!isLang(body.language)) return NextResponse.json({ error: "language must be 'en' or 'es'" }, { status: 400 })

  const { error } = await createAdminClient()
    .from('clients')
    .update({ preferred_language: body.language })
    .eq('id', body.clientId)
  if (error) {
    if (error.code === '42703' || error.code === 'PGRST204') {
      console.warn('[more] clients.preferred_language is missing; run migration 259.')
      return NextResponse.json({ ok: false, reason: 'not_migrated' })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, language: body.language })
}
