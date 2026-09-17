/**
 * /api/dashboard/announce — the Announce flow's context and its commit (owner 2026-09-17).
 *
 * GET ?clientId= : what the sheet needs before it asks anything — the business's name, the
 *   order-online link and website, whether Google posting is open (Pro), how many regulars are
 *   on the list, a shoot already booked (so "add to my next shoot" can be offered), and the
 *   prices of a graphic, a video and a shoot from the SAME sheets the Request Desk charges.
 *
 * POST : the whole plan, made real in one call. Every line the plan screen promised lands on
 *   the rail that already exists for it, and nothing is promised that has no rail:
 *     the picture   own photo → used as is · graphic → a priced ORDER, work order minted now,
 *                   billed by the team · video / shoot → a priced order that waits for the card
 *                   · next shoot → added to that booked shoot's brief · words only → nothing
 *     the posts     photo in hand → scheduled on the social rail (feed, Story, the repeat)
 *                   picture being made → a draft handed to the team with the date, posted once
 *                   the picture is approved
 *     Google        Pro and posting now → posted; otherwise a dated draft for the team
 *     also update   Google menu / website menu / delivery apps → one menu request ·
 *                   online ordering → a request · regulars → an email request ·
 *                   table tent → a print request · the team → a card to every portal user
 *   Then one message on the owner's thread with the whole plan, and an announcements row that
 *   remembers every line and the id of the thing it became. The plan comes back to the sheet.
 */
import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { createAdminClient } from '@/lib/supabase/admin'
import { createCreativeRequest, graphicOrderCents } from '@/lib/requests/create'
import { priceCreativeRequest } from '@/lib/requests/pricing'
import { getActiveRateCard } from '@/lib/design/price-sheet'
import { createPost, listPostTargets } from '@/lib/channels/adapters/zernio'
import { publishOwnerGbpPost } from '@/lib/gbp-apply/owner-post'
import { isProTier } from '@/lib/entitlements'
import { notifyClientOwners, notifyStaffForClient } from '@/lib/notifications'
import { bulkSetSpecialHours } from '@/lib/gbp-bulk'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Mode = 'own' | 'graphic' | 'video' | 'shoot' | 'nextshoot' | 'words'
type Also = 'gmenu' | 'sitemenu' | 'ordering' | 'apps' | 'email' | 'print' | 'team' | 'ghours' | 'fbevent' | 'sitepage' | 'creators'
type Cta = 'order' | 'visit' | 'reserve' | 'message'
/** what the print line makes, per kind */
const PRINT: Record<string, string> = { dish: 'Table tent', deal: 'Flyer', event: 'Poster', hours: 'Door sign', open: 'Banner', holiday: 'Menu insert', hiring: 'Window sign', else: 'Flyer' }

export interface PlanLine {
  key: string
  label: string
  detail: string
  /** YYYY-MM-DD, the day this happens */
  date: string | null
  /** cents, only when it costs money */
  cost: number | null
  status: 'scheduled' | 'with_team' | 'needs_payment' | 'done' | 'later'
  ref: { kind: 'post' | 'draft' | 'request' | 'gbp' | 'page'; id: string | null; href?: string } | null
  /** one short reason, the sheet's, carried through so the done screen reads like the plan did */
  why?: string
}

interface Body {
  clientId?: string
  kind?: string
  answers?: Record<string, unknown>
  picture?: { mode?: Mode; mediaUrls?: unknown; priceOn?: boolean; brandKit?: boolean; readyBy?: string; nextShootId?: string }
  places?: { accountIds?: unknown; google?: boolean; story?: boolean; also?: unknown }
  timing?: { at?: string | null; timezone?: string; again?: boolean; boost?: boolean; boostCents?: number; reminders?: unknown }
  /** the reasons the sheet showed, by plan key, carried onto the lines it made */
  whys?: Record<string, unknown>
  words?: { social?: string; google?: string; cta?: Cta; languages?: unknown; card?: string }
  /** the date answers as ISO days, beside the spelled-out ones in `answers` */
  dates?: Record<string, unknown>
  /** one-day hours, for Google's special hours: closed, or open and close as HH:MM */
  hours?: { oneDay?: boolean; closed?: boolean; open?: string; close?: string }
}
/** a second post the sheet asked for: a reminder, a teaser, a repeat, a Story the morning of */
interface Extra { key: string; label: string; detail: string; at: string; text: string; story?: boolean }

const day = (iso: string) => iso.slice(0, 10)
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000)
const clean = (s: unknown, max = 600) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
const isHttps = (u: unknown): u is string => typeof u === 'string' && u.startsWith('https://')
const niceDay = (iso: string) => { const dt = new Date(iso + 'T12:00:00'); return Number.isNaN(dt.getTime()) ? iso : dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) }
const whenWord = (due: string | null): string => {
  if (!due) return 'No rush'
  const days = Math.round((new Date(due + 'T12:00:00').getTime() - Date.now()) / 86400000)
  return days <= 7 ? 'This week' : days <= 14 ? 'In 2 weeks' : days <= 31 ? 'This month' : 'No rush'
}

async function context(admin: ReturnType<typeof createAdminClient>, clientId: string) {
  const today = new Date().toISOString().slice(0, 10)
  const [client, site, guests, shoot, card] = await Promise.all([
    admin.from('clients').select('name, tier, website').eq('id', clientId).maybeSingle(),
    admin.from('site_settings').select('order_online_url, reservation_url').eq('client_id', clientId).maybeSingle(),
    admin.from('guest_contacts').select('id', { count: 'exact', head: true }).eq('client_id', clientId).is('unsubscribed_at', null),
    admin.from('creative_requests').select('id, due_date, assigned_to_name, status').eq('client_id', clientId).eq('type', 'photos')
      .in('status', ['requested', 'quoted', 'accepted', 'in_progress', 'awaiting_payment']).gte('due_date', today).order('due_date', { ascending: true }).limit(1).maybeSingle(),
    getActiveRateCard().catch(() => null),
  ])
  const c = (client.data ?? {}) as { name?: string; tier?: string; website?: string }
  const s = (site.data ?? {}) as { order_online_url?: string; reservation_url?: string }
  const sh = shoot.data as { id: string; due_date: string; assigned_to_name?: string | null } | null
  const graphic = card ? graphicOrderCents({ destinations: ['instagram-post', 'facebook-post'], tier: 2, photos: 'own' }, card.card) : null
  const video = priceCreativeRequest('video', { what: 'x', filming: 'Use clips and photos I have', count: 'Just 1', when: 'No rush' })?.totalCents ?? null
  const shootPrice = priceCreativeRequest('photos', { what: 'Food and dishes', use: 'Social media', when: 'No rush' })?.totalCents ?? null
  return {
    name: c.name?.trim() || 'the restaurant',
    pro: isProTier(c.tier ?? null),
    website: c.website ?? null,
    orderUrl: isHttps(s.order_online_url) ? s.order_online_url : null,
    reserveUrl: isHttps(s.reservation_url) ? s.reservation_url : null,
    guests: guests.count ?? 0,
    nextShoot: sh ? { id: sh.id, date: sh.due_date, who: sh.assigned_to_name ?? null } : null,
    prices: { graphic, video, shoot: shootPrice },
  }
}

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })
  const access = await checkClientAccess(clientId)
  if (!access.authorized) return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status: access.reason === 'unauthenticated' ? 401 : 403 })
  const admin = createAdminClient()
  return NextResponse.json(await context(admin, clientId), { headers: { 'Cache-Control': 'no-store' } })
}

/** One message on the owner's thread with their team: the whole plan, readable. Never throws. */
async function tellTheTeam(admin: ReturnType<typeof createAdminClient>, clientId: string, userId: string, text: string): Promise<boolean> {
  try {
    const { data: biz } = await admin.from('businesses').select('id').eq('client_id', clientId).maybeSingle()
    if (!biz?.id) return false
    const { data: open } = await admin.from('message_threads').select('id').eq('business_id', biz.id).order('last_message_at', { ascending: false }).limit(1).maybeSingle()
    let threadId = open?.id as string | undefined
    if (!threadId) {
      const { data: made } = await admin.from('message_threads').insert({ business_id: biz.id, subject: 'Announcements', last_message_at: new Date().toISOString() }).select('id').single()
      threadId = made?.id as string | undefined
    }
    if (!threadId) return false
    const { data: profile } = await admin.from('profiles').select('full_name').eq('id', userId).maybeSingle()
    const { error } = await admin.from('messages').insert({
      business_id: biz.id, thread_id: threadId, sender_id: userId,
      sender_name: (profile?.full_name as string) ?? 'Owner', sender_role: 'client', content: text, attachments: [],
    })
    if (error) return false
    await admin.from('message_threads').update({ last_message_at: new Date().toISOString() }).eq('id', threadId)
    return true
  } catch { return false }
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Body
  const clientId = body.clientId
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })
  const access = await checkClientAccess(clientId)
  if (!access.authorized || !access.userId) return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status: access.reason === 'unauthenticated' ? 401 : 403 })
  const userId = access.userId
  const admin = createAdminClient()
  const ctx = await context(admin, clientId)

  /* ── the spec, cleaned ── */
  const kind = clean(body.kind, 20) || 'else'
  const a: Record<string, string> = {}
  for (const [k, v] of Object.entries(body.answers ?? {})) if (typeof v === 'string' && v.trim()) a[k] = clean(v, 300)
  const name = a.what || 'the news'
  const mode: Mode = (['own', 'graphic', 'video', 'shoot', 'nextshoot', 'words'] as Mode[]).includes(body.picture?.mode as Mode) ? (body.picture!.mode as Mode) : 'words'
  const media = (Array.isArray(body.picture?.mediaUrls) ? body.picture!.mediaUrls : []).filter(isHttps).slice(0, 10) as string[]
  const priceOn = body.picture?.priceOn !== false
  const readyBy = typeof body.picture?.readyBy === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.picture.readyBy) ? body.picture.readyBy : null
  const accountIds = (Array.isArray(body.places?.accountIds) ? body.places!.accountIds : []).filter((x): x is string => typeof x === 'string').slice(0, 10)
  const wantsGoogle = body.places?.google === true
  const wantsStory = body.places?.story === true
  const also = (Array.isArray(body.places?.also) ? body.places!.also : []).filter((x): x is Also => ['gmenu', 'sitemenu', 'ordering', 'apps', 'email', 'print', 'team', 'ghours', 'fbevent', 'sitepage', 'creators'].includes(String(x)))
  const tz = clean(body.timing?.timezone, 60) || 'America/Los_Angeles'
  const atIso = typeof body.timing?.at === 'string' && !Number.isNaN(Date.parse(body.timing.at)) ? new Date(body.timing.at).toISOString() : null
  const postNow = !atIso || Date.parse(atIso) <= Date.now() + 60_000
  const again = body.timing?.again === true
  const boost = body.timing?.boost === true
  const boostCents = Number.isFinite(Number(body.timing?.boostCents)) ? Math.max(0, Math.min(50000, Math.round(Number(body.timing?.boostCents)))) : 2000
  const whys: Record<string, string> = {}
  for (const [k, v] of Object.entries(body.whys ?? {})) if (typeof v === 'string' && v.trim()) whys[k] = clean(v, 140)
  const social = clean(body.words?.social, 2200)
  const gtext = clean(body.words?.google, 1500).replace(/https?:\/\/\S+/g, '').trim()
  const cta: Cta = (['order', 'visit', 'reserve', 'message'] as Cta[]).includes(body.words?.cta as Cta) ? (body.words!.cta as Cta) : 'visit'
  const card = clean(body.words?.card, 1200)
  const d: Record<string, string> = {}
  for (const [k, v] of Object.entries(body.dates ?? {})) if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) d[k] = v
  const hrs = body.hours && typeof body.hours === 'object' ? body.hours : null
  const hhmm = (v: unknown) => (typeof v === 'string' && /^\d{2}:\d{2}$/.test(v) ? v : undefined)
  const extras: Extra[] = (Array.isArray(body.timing?.reminders) ? body.timing!.reminders as unknown[] : [])
    .map((x) => x as Record<string, unknown>)
    .filter((x) => x && typeof x.at === 'string' && !Number.isNaN(Date.parse(String(x.at))) && Date.parse(String(x.at)) > Date.now())
    .slice(0, 12)
    .map((x) => ({ key: clean(x.key, 20) || 'extra', label: clean(x.label, 60) || 'Another post', detail: clean(x.detail, 120), at: new Date(String(x.at)).toISOString(), text: clean(x.text, 2200), story: x.story === true }))
  const madeLater = mode === 'graphic' || mode === 'video' || mode === 'shoot' || mode === 'nextshoot'
  const postDay = day(atIso ?? new Date().toISOString())
  const plan: PlanLine[] = []
  const errors: string[] = []
  let total = 0

  /* ── the announcement row first, so every line can point back at it ── */
  const { data: row } = await admin.from('announcements').insert({
    client_id: clientId, kind, status: 'planned', answers: a,
    picture: { mode, mediaUrls: media, priceOn, readyBy },
    places: { accountIds, google: wantsGoogle, story: wantsStory, also },
    timing: { at: atIso, timezone: tz, again, boost, boostCents },
    words: { social, google: gtext, cta },
    created_by: userId,
  }).select('id').single()
  const announcementId = (row?.id as string | undefined) ?? null

  /* ── the picture ── */
  let requestId: string | null = null
  const attachments = media.map((url, i) => ({ url, name: `photo-${i + 1}` }))
  const facts = [a.line, a.doing, a.kindOfNight ? `Kind: ${a.kindOfNight}` : '', a.getin ? `Getting in: ${a.getin}` : '', a.who ? `With ${a.who}` : '', a.weekly ? 'Every week' : '', a.price ? `Price ${a.price}` : '', a.when ? `When: ${a.when}` : '', a.time ? `At ${a.time}` : '', a.where ? `Where: ${a.where}` : '', a.tickets ? `Tickets: ${a.tickets}` : '', a.code ? `Code ${a.code}` : '', a.how ? `Apply: ${a.how}` : '', a.address ? `Address: ${a.address}` : '', a.offer ? `Opening offer: ${a.offer}` : '', a.from ? `From ${a.from}` : '', a.until ? `Until ${a.until}` : '', a.deadline ? `Pre-orders by ${a.deadline}` : '', a.tags ? `Good to know: ${a.tags}` : ''].filter(Boolean).join('. ')
  if (mode === 'graphic') {
    const dests: string[] = []
    const destLabels: string[] = []
    if (accountIds.length) { dests.push('instagram-post', 'facebook-post'); destLabels.push('Instagram post', 'Facebook post') }
    if (wantsStory) { dests.push('instagram-story'); destLabels.push('Instagram Story') }
    if (wantsGoogle) { dests.push('google-listing'); destLabels.push('Google listing') }
    if (also.includes('print')) { dests.push('table-tent'); destLabels.push('Table tent') }
    if (!dests.length) { dests.push('instagram-post'); destLabels.push('Instagram post') }
    const r = await createCreativeRequest({
      clientId, userId, type: 'graphic', order: true, due_date: readyBy,
      answers: { what: `${name} announcement`, where: destLabels.join(', '), words: [name, priceOn && a.price ? a.price : ''].filter(Boolean).join(' · '), when: whenWord(readyBy), notes: `Announce: ${name}. ${facts} ${body.picture?.brandKit === false ? 'No brand kit.' : 'Match the brand kit.'} Announcement ${announcementId ?? ''}`.trim() },
      attachments,
      design: { destinations: dests, tier: 2, photos: media.length ? 'own' : 'none', dueDateISO: readyBy ?? undefined },
    })
    if (r.ok) {
      requestId = r.row.id; total += r.orderCents ?? 0
      plan.push({ key: 'graphic', label: 'We start the graphic', detail: media.length ? `From your ${media.length === 1 ? 'photo' : `${media.length} photos`}${priceOn && a.price ? ', price on it' : ''}` : 'From our own photos', date: day(new Date().toISOString()), cost: r.orderCents, status: 'with_team', ref: { kind: 'request', id: r.row.id, href: `/dashboard/requests/${r.row.id}` } })
      plan.push({ key: 'approve', label: 'You approve it', detail: 'One tap in Coming up', date: readyBy, cost: null, status: 'later', ref: { kind: 'request', id: r.row.id, href: `/dashboard/requests/${r.row.id}` } })
    } else errors.push(`The graphic did not start: ${r.error}`)
  } else if (mode === 'video' || mode === 'shoot') {
    const isVideo = mode === 'video'
    const r = await createCreativeRequest({
      clientId, userId, type: isVideo ? 'video' : 'photos', order: true, due_date: readyBy, attachments,
      answers: isVideo
        ? { what: `${name}: ${a.line || 'the dish, plated'}`, filming: media.length ? 'Use clips and photos I have' : 'Come film at my place', count: 'Just 1', featuring: name, when: whenWord(readyBy), notes: `Announce: ${name}. ${facts}` }
        : { what: 'Food and dishes', use: 'Social media, Google and Yelp, Menus', dishes: name, featuring: name, when: whenWord(readyBy), notes: `Announce: ${name}. ${facts}` },
    })
    if (r.ok) {
      requestId = r.row.id; total += r.orderCents ?? 0
      plan.push({ key: mode, label: isVideo ? 'The video' : 'The shoot', detail: r.needsPayment ? 'Pay to start. Then the team takes it' : 'The team takes it', date: readyBy, cost: r.orderCents, status: r.needsPayment ? 'needs_payment' : 'with_team', ref: { kind: 'request', id: r.row.id, href: `/dashboard/requests/${r.row.id}` } })
      plan.push({ key: 'approve', label: 'You approve it', detail: 'One tap in Coming up', date: readyBy, cost: null, status: 'later', ref: { kind: 'request', id: r.row.id, href: `/dashboard/requests/${r.row.id}` } })
    } else errors.push(`${isVideo ? 'The video' : 'The shoot'} did not start: ${r.error}`)
  } else if (mode === 'nextshoot' && ctx.nextShoot && body.picture?.nextShootId === ctx.nextShoot.id) {
    const { data: sh } = await admin.from('creative_requests').select('id, brief, team_note').eq('id', ctx.nextShoot.id).eq('client_id', clientId).maybeSingle()
    if (sh) {
      const brief = { ...((sh.brief as Record<string, unknown>) ?? {}) }
      brief.dishes = [clean(brief.dishes, 400), `${name} (for the announcement)`].filter(Boolean).join('; ')
      const note = [clean(sh.team_note, 800), `Add ${name} to this shoot. ${facts}`].filter(Boolean).join('\n')
      await admin.from('creative_requests').update({ brief, team_note: note }).eq('id', sh.id)
      notifyStaffForClient(clientId, ['strategist', 'designer'], { kind: 'client_request', title: `Add to the shoot: ${name}`, body: facts || name, link: `/admin/requests` }).catch(() => {})
      requestId = sh.id
      plan.push({ key: 'nextshoot', label: 'Added to your shoot', detail: `${ctx.nextShoot.who ? `With ${ctx.nextShoot.who}, ` : ''}we shoot it that day`, date: ctx.nextShoot.date, cost: null, status: 'with_team', ref: { kind: 'request', id: sh.id, href: `/dashboard/requests/${sh.id}` } })
      plan.push({ key: 'approve', label: 'You pick the shot', detail: 'One tap in Coming up', date: ctx.nextShoot.date, cost: null, status: 'later', ref: { kind: 'request', id: sh.id, href: `/dashboard/requests/${sh.id}` } })
    }
  }

  /* ── the posts ── */
  const targets = accountIds.length ? (await listPostTargets(clientId).catch(() => [])).filter((t) => accountIds.includes(t.accountId)) : []
  const platforms = Array.from(new Set(targets.map((t) => t.platform)))
  const nice = (p: string) => (p === 'tiktok' ? 'TikTok' : p === 'linkedin' ? 'LinkedIn' : p.charAt(0).toUpperCase() + p.slice(1))
  const postWhen = postNow ? { kind: 'now' as const } : { kind: 'at' as const, iso: atIso!, timezone: tz }
  /* the rails the composer has and the sheet never used (owner 2026-09-17): the people named
     become collaborators and tags, the location rides the client's own page, the details go in
     the first comment, and Facebook gets the longer paragraph while Instagram keeps the line */
  const handles = Array.from(new Set(((a.who ?? '') + ' ' + (a.line ?? '')).match(/@[A-Za-z0-9._]{1,30}/g) ?? [])).map((h) => h.slice(1))
  const details = [a.getin, a.tickets ? `Tickets ${a.tickets}` : '', a.time ? `${a.when ?? ''} ${a.time}`.trim() : '', a.where, a.code ? `Code ${a.code}` : '', a.tags ? a.tags : '', a.rsvp ?? a.link ?? ''].filter(Boolean).join(' · ')
  const socialRails = {
    collaborators: handles.slice(0, 3),
    tagged: handles.slice(0, 20),
    locationId: targets.find((t) => t.pageId)?.pageId ?? null,
    firstComment: details && !social.includes(details) ? details : undefined,
    perPlatform: details ? { facebook: `${social}\n\n${details}` } : undefined,
  }
  const hourLabel = atIso ? new Date(atIso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz }) : 'now'
  const draft = async (caption: string, plats: string[], date: string | null, extra: Record<string, unknown> = {}) => {
    const { data } = await admin.from('content_drafts').insert({
      client_id: clientId, status: 'draft', service_line: 'social', idea: `Announce: ${name}`.slice(0, 300), caption,
      target_platforms: plats, media_urls: media, target_publish_date: date, proposed_by: userId, proposed_via: 'owner_composer',
      media_brief: { announcementId, ...extra },
    }).select('id').single()
    return (data?.id as string | undefined) ?? null
  }
  if (targets.length && social) {
    const igNeedsPhoto = platforms.includes('instagram') && media.length === 0
    if (!madeLater && !igNeedsPhoto) {
      try {
        const r = await createPost(clientId, { content: social, targets, mediaUrls: media, when: postWhen, ...socialRails, metadata: { source: 'announce', announcementId } })
        plan.push({ key: 'post', label: platforms.map(nice).join(', '), detail: `${postNow ? 'Posted now' : `${hourLabel}, your best hour`}${handles.length ? `. With ${handles.map((h) => '@' + h).join(' ')}` : ''}`, date: postDay, cost: null, status: postNow ? 'done' : 'scheduled', ref: { kind: 'post', id: r.id }, why: whys.post })
        admin.from('content_drafts').insert({ client_id: clientId, status: 'published', idea: `Announce: ${name}`.slice(0, 300), caption: social, target_platforms: platforms, media_urls: media, proposed_by: userId, proposed_via: 'owner_composer', published_post_id: r.id, ...(postNow ? { published_at: new Date().toISOString() } : { scheduled_for: atIso }) }).then(({ error }) => { if (error) console.error('[announce] post log', error.message) })
      } catch (e) { errors.push(`The post did not go: ${e instanceof Error ? e.message : 'the social rail refused it'}`) }
      if (wantsStory && media.length) {
        const st = targets.filter((t) => t.platform === 'instagram' || t.platform === 'facebook')
        if (st.length) {
          const storyAt = new Date((atIso ? Date.parse(atIso) : Date.now()) + 60 * 60 * 1000).toISOString()
          try {
            const r = await createPost(clientId, { content: social, targets: st, mediaUrls: [media[0]], when: { kind: 'at', iso: storyAt, timezone: tz }, story: true, metadata: { source: 'announce-story', announcementId } })
            plan.push({ key: 'story', label: 'Story goes up', detail: 'An hour after the post', date: day(storyAt), cost: null, status: 'scheduled', ref: { kind: 'post', id: r.id } })
          } catch (e) { errors.push(`The Story did not go: ${e instanceof Error ? e.message : 'the social rail refused it'}`) }
        }
      }
      if (again) {
        const againAt = addDays(new Date(atIso ?? Date.now()), 7).toISOString()
        try {
          const r = await createPost(clientId, { content: social, targets, mediaUrls: media, when: { kind: 'at', iso: againAt, timezone: tz }, metadata: { source: 'announce-again', announcementId } })
          plan.push({ key: 'again', label: 'Posted again', detail: 'A week later, for the ones who missed it', date: day(againAt), cost: null, status: 'scheduled', ref: { kind: 'post', id: r.id } })
        } catch (e) { errors.push(`The repeat did not schedule: ${e instanceof Error ? e.message : 'the social rail refused it'}`) }
      }
    } else {
      const id = await draft(social, platforms, postDay, { story: wantsStory, again, waitsFor: requestId, reason: madeLater ? 'picture' : 'instagram_needs_photo' })
      plan.push({ key: 'post', label: platforms.map(nice).join(', '), detail: madeLater ? `Once you approve the picture. ${hourLabel === 'now' ? '' : hourLabel}`.trim() : 'Instagram needs a photo. The team adds one, then posts', date: postDay, cost: null, status: 'with_team', ref: { kind: 'draft', id } })
      if (wantsStory) plan.push({ key: 'story', label: 'Story goes up', detail: 'Same day, once the picture is in', date: postDay, cost: null, status: 'with_team', ref: { kind: 'draft', id } })
      if (again) plan.push({ key: 'again', label: 'Posted again', detail: 'A week later', date: day(addDays(new Date(atIso ?? Date.now()), 7).toISOString()), cost: null, status: 'with_team', ref: { kind: 'draft', id } })
    }
  }

  /* ── Google ── */
  if (wantsGoogle && gtext) {
    const link = [a.rsvp, a.how, a.link].find(isHttps) ?? null
    const ctaObj = cta === 'order' && ctx.orderUrl ? { type: 'ORDER' as const, url: ctx.orderUrl } : cta === 'reserve' && (link ?? ctx.reserveUrl) ? { type: 'LEARN_MORE' as const, url: (link ?? ctx.reserveUrl)! } : link ? { type: 'LEARN_MORE' as const, url: link } : cta === 'message' ? { type: 'CALL' as const } : null
    /* a deal is an OFFER and an event is an EVENT on Google: both carry a title and dates */
    const today = day(new Date().toISOString())
    const gType = kind === 'deal' ? { postType: 'OFFER' as const, event: { title: name.slice(0, 58), startDate: d.from ?? today, endDate: d.until ?? day(addDays(new Date(), 30).toISOString()) }, offer: { ...(a.code ? { couponCode: a.code.slice(0, 58) } : {}), ...(a.line ? { terms: a.line.slice(0, 300) } : {}) } }
      : kind === 'event' && d.when ? { postType: 'EVENT' as const, event: { title: name.slice(0, 58), startDate: d.when, endDate: d.when } }
      : {}
    if (ctx.pro && postNow && !madeLater) {
      const r = await publishOwnerGbpPost(clientId, { text: gtext, cta: ctaObj, mediaUrls: media, ...gType })
      if (r.ok) plan.push({ key: 'google', label: 'Google', detail: r.live ? 'Posted now' : 'Sent to Google', date: postDay, cost: null, status: 'done', ref: { kind: 'gbp', id: r.postUrl ?? null } })
      else errors.push(`Google did not take the post: ${r.error}`)
    } else {
      const id = await draft(gtext, ['google'], postDay, { cta: ctaObj, waitsFor: requestId, ...gType })
      plan.push({ key: 'google', label: 'Google', detail: madeLater ? 'Once the picture is in' : !ctx.pro ? 'The team posts it for you' : 'The team posts it on the day', date: postDay, cost: null, status: 'with_team', ref: { kind: 'draft', id } })
    }
  }

  /* ── the extra posts: a reminder, a teaser, a repeat, a Story the morning of ── */
  for (const x of extras) {
    if (!targets.length || !x.text) continue
    const st = x.story ? targets.filter((t) => t.platform === 'instagram' || t.platform === 'facebook') : targets
    if (!st.length) continue
    const igNeedsPhoto = st.some((t) => t.platform === 'instagram') && media.length === 0
    if (!madeLater && !igNeedsPhoto && (!x.story || media.length)) {
      try {
        const r = await createPost(clientId, { content: x.text, targets: st, mediaUrls: x.story ? [media[0]] : media, when: { kind: 'at', iso: x.at, timezone: tz }, story: x.story, metadata: { source: `announce-${x.key}`, announcementId } })
        plan.push({ key: x.key, label: x.label, detail: x.detail, date: day(x.at), cost: null, status: 'scheduled', ref: { kind: 'post', id: r.id } })
      } catch (e) { errors.push(`${x.label} did not schedule: ${e instanceof Error ? e.message : 'the social rail refused it'}`) }
    } else {
      const id = await draft(x.text, Array.from(new Set(st.map((t) => t.platform))), day(x.at), { story: x.story, waitsFor: requestId, extra: x.key })
      plan.push({ key: x.key, label: x.label, detail: `${x.detail}. The team posts it`, date: day(x.at), cost: null, status: 'with_team', ref: { kind: 'draft', id } })
    }
  }

  /* ── hours on Google, set directly when it is one day (closed, or open and close) ── */
  let googleHoursDone = false
  const hoursDay = kind === 'hours' && hrs?.oneDay ? d.from ?? null : kind === 'holiday' && hrs ? d.date ?? null : null
  if (hoursDay && hrs && (hrs.closed === true || (hhmm(hrs.open) && hhmm(hrs.close)))) {
    const { data: locs } = await admin.from('gbp_locations').select('id').eq('client_id', clientId).eq('status', 'assigned')
    const ids = (locs ?? []).map((l) => String(l.id))
    if (ids.length) {
      try {
        const r = await bulkSetSpecialHours(clientId, ids, hrs.closed === true ? { date: hoursDay, closed: true } : { date: hoursDay, closed: false, open: hhmm(hrs.open), close: hhmm(hrs.close) })
        if (r.succeeded.length && !r.failed.length) {
          googleHoursDone = true
          plan.push({ key: 'ghours-google', label: 'Google hours set', detail: hrs.closed === true ? `Closed ${niceDay(hoursDay)}` : `${hrs.open} to ${hrs.close} on ${niceDay(hoursDay)}`, date: day(new Date().toISOString()), cost: null, status: 'done', ref: null })
        } else errors.push(`Google did not take the hours: ${r.failed[0]?.error ?? 'no location answered'}. The team will set them.`)
      } catch (e) { errors.push(`Google did not take the hours: ${e instanceof Error ? e.message : 'unknown'}. The team will set them.`) }
    }
  }

  /* ── also update ── */
  const menuBits = also.filter((x) => x === 'gmenu' || x === 'sitemenu' || x === 'apps')
  if (menuBits.length) {
    const which = [menuBits.includes('apps') ? 'Delivery apps' : '', menuBits.includes('sitemenu') || menuBits.includes('gmenu') ? 'Dine in' : ''].filter(Boolean).join(', ')
    const where = [menuBits.includes('gmenu') ? 'Google menu' : '', menuBits.includes('sitemenu') ? 'website menu' : '', menuBits.includes('apps') ? 'DoorDash and Uber Eats' : ''].filter(Boolean).join(', ')
    const r = await createCreativeRequest({ clientId, userId, type: 'menu', due_date: postDay, attachments, answers: { which, change: 'Update prices or items', items: `Add ${name}${a.price ? `, ${a.price}` : ''}. ${a.line ?? ''}${a.tags ? ` Good to know: ${a.tags}.` : ''}`.trim(), when: whenWord(postDay), notes: `Update the ${where}. Announcement ${announcementId ?? ''}`.trim() } })
    if (r.ok) plan.push({ key: 'menus', label: where.charAt(0).toUpperCase() + where.slice(1), detail: `Name${media.length ? ', photo' : ''}${a.price ? `, ${a.price}` : ''}`, date: postDay, cost: null, status: 'with_team', ref: { kind: 'request', id: r.row.id, href: `/dashboard/requests/${r.row.id}` } })
    else errors.push(`The menu update did not send: ${r.error}`)
  }
  if (also.includes('ghours') || (hoursDay && !googleHoursDone && hrs)) {
    const hoursDue = d.from ?? d.date ?? postDay
    const where = googleHoursDone ? 'the website and the delivery apps' : 'Google, the website and the delivery apps'
    const what = kind === 'open' ? `Mark us open on ${where}: ${name}${a.line ? `. ${a.line}` : ''}${a.from ? `. From ${a.from}` : ''}`
      : `Update our hours on ${where}: ${name}${a.doing ? `. ${a.doing}` : ''}${a.line ? `. ${a.line}` : ''}${hoursDay && hrs ? `. ${hrs.closed === true ? 'Closed' : `${hrs.open ?? ''} to ${hrs.close ?? ''}`} on ${niceDay(hoursDay)}` : ''}${a.from ? `. From ${a.from}` : ''}${a.until ? ` until ${a.until}` : ''}`
    const r = await createCreativeRequest({ clientId, userId, type: 'other', due_date: hoursDue, answers: { what, when: whenWord(hoursDue) } })
    if (r.ok) plan.push({ key: 'ghours', label: kind === 'open' ? 'Marked open everywhere' : googleHoursDone ? 'Hours on the website and apps' : 'Hours updated everywhere', detail: where.charAt(0).toUpperCase() + where.slice(1), date: hoursDue, cost: null, status: 'with_team', ref: { kind: 'request', id: r.row.id, href: `/dashboard/requests/${r.row.id}` } })
    else errors.push(`The hours update did not send: ${r.error}`)
  }
  /* an event's own lines: the Facebook Event, the events page, two creators at the table. Team work, no rail yet. */
  const eventWhen = [a.when, a.time].filter(Boolean).join(' at ')
  if (also.includes('fbevent')) {
    const r = await createCreativeRequest({ clientId, userId, type: 'other', due_date: postDay, attachments, answers: { what: `Make a Facebook Event for ${name}${eventWhen ? `, ${eventWhen}` : ''}${a.weekly ? ', every week' : ''}. ${facts}${social ? ` Use these words: ${social}` : ''}`.trim(), when: whenWord(postDay) } })
    if (r.ok) plan.push({ key: 'fbevent', label: 'Facebook Event', detail: 'The team makes it. Going spreads it', date: postDay, cost: null, status: 'with_team', ref: { kind: 'request', id: r.row.id, href: `/dashboard/requests/${r.row.id}` } })
    else errors.push(`The Facebook Event did not send: ${r.error}`)
  }
  if (also.includes('sitepage')) {
    const r = await createCreativeRequest({ clientId, userId, type: 'other', due_date: postDay, attachments, answers: { what: `Add ${name} to the website events page${eventWhen ? `: ${eventWhen}` : ''}${a.weekly ? ', every week' : ''}. ${facts}`.trim(), when: whenWord(postDay) } })
    if (r.ok) plan.push({ key: 'sitepage', label: 'Website events page', detail: 'Added with the date and the link', date: postDay, cost: null, status: 'with_team', ref: { kind: 'request', id: r.row.id, href: `/dashboard/requests/${r.row.id}` } })
    else errors.push(`The events page did not send: ${r.error}`)
  }
  if (also.includes('creators')) {
    const r = await createCreativeRequest({ clientId, userId, type: 'other', due_date: d.when ?? postDay, attachments, answers: { what: `Invite two local food creators to ${name}${eventWhen ? `, ${eventWhen}` : ''}, comped. ${facts}`.trim(), when: whenWord(d.when ?? postDay) } })
    if (r.ok) plan.push({ key: 'creators', label: 'Two creators invited', detail: 'Comped seats, they post from the room', date: d.when ?? postDay, cost: null, status: 'with_team', ref: { kind: 'request', id: r.row.id, href: `/dashboard/requests/${r.row.id}` } })
    else errors.push(`The creator invite did not send: ${r.error}`)
  }
  if (also.includes('ordering')) {
    const r = await createCreativeRequest({ clientId, userId, type: 'other', due_date: postDay, attachments, answers: { what: `Add ${name}${a.price ? ` (${a.price})` : ''} to online ordering so the Order online button works from day one. ${a.line ?? ''}`.trim(), when: whenWord(postDay) } })
    if (r.ok) plan.push({ key: 'ordering', label: 'Online ordering', detail: 'Added so Order online works', date: postDay, cost: null, status: 'with_team', ref: { kind: 'request', id: r.row.id, href: `/dashboard/requests/${r.row.id}` } })
    else errors.push(`The ordering update did not send: ${r.error}`)
  }
  if (also.includes('email')) {
    const r = await createCreativeRequest({ clientId, userId, type: 'email', due_date: day(addDays(new Date(atIso ?? Date.now()), 1).toISOString()), attachments, answers: { what: `Tell our regulars about ${name}`, list: ctx.guests > 0 ? 'Yes' : 'Not yet', when: whenWord(postDay), notes: `Same words as the post:\n${social || gtext}` } })
    if (r.ok) plan.push({ key: 'email', label: ctx.guests > 0 ? `Email to ${ctx.guests.toLocaleString()} regulars` : 'Email to your regulars', detail: 'Written from the same words', date: day(addDays(new Date(atIso ?? Date.now()), 1).toISOString()), cost: null, status: 'with_team', ref: { kind: 'request', id: r.row.id, href: `/dashboard/requests/${r.row.id}` } })
    else errors.push(`The email did not send to the team: ${r.error}`)
  }
  if (also.includes('print')) {
    const thing = PRINT[kind] ?? 'Flyer'
    const r = await createCreativeRequest({ clientId, userId, type: 'print', due_date: postDay, attachments, answers: { what: `${thing} for ${name}${a.price ? `, ${a.price}` : ''}`, printing: 'Not sure', when: whenWord(postDay), notes: facts } })
    if (r.ok) plan.push({ key: 'print', label: thing, detail: 'The team quotes it, printed or a file', date: postDay, cost: null, status: 'with_team', ref: { kind: 'request', id: r.row.id, href: `/dashboard/requests/${r.row.id}` } })
    else errors.push(`The table tent did not send: ${r.error}`)
  }
  if (also.includes('team') && card) {
    const r = await notifyClientOwners(clientId, { kind: 'client_request', title: `Team card: ${name}`, body: card.slice(0, 1000), link: '/dashboard/notifications' }).catch(() => ({ notified: 0 }))
    plan.push({ key: 'team', label: 'Team card', detail: r.notified > 1 ? `Sent to ${r.notified} people on the portal. Copy it for the rest` : 'Copy it for the team', date: day(new Date().toISOString()), cost: null, status: 'done', ref: null })
  }
  if (boost) plan.push({ key: 'boost', label: 'Boost it', detail: `$${Math.round(boostCents / 100)}, about ${(Math.round(boostCents / 100) * 150).toLocaleString()} people nearby. Open Boost once it has posted`, date: postDay, cost: boostCents, status: 'later', ref: { kind: 'page', id: null, href: '/dashboard/boost' }, why: whys.boost })
  plan.push({ key: 'results', label: 'How it did', detail: kind === 'event' ? 'Views, RSVPs and mentions, in Insights' : 'Views, saves and mentions, in Insights', date: day(addDays(new Date(kind === 'event' && d.when ? d.when + 'T12:00:00' : atIso ?? Date.now()), 7).toISOString()), cost: null, status: 'later', ref: { kind: 'page', id: null, href: '/dashboard/insights/posts' } })

  for (const l of plan) if (!l.why && whys[l.key]) l.why = whys[l.key]

  /* ── the team hears the whole plan once ── */
  const lines = [`New announcement: ${name}`, facts, '', ...plan.map((l) => `${l.date ?? ''} ${l.label}: ${l.detail}${l.cost ? ` ($${Math.round(l.cost / 100)})` : ''}`.trim())]
  if (social) lines.push('', `Caption\n${social}`)
  if (gtext) lines.push('', `Google\n${gtext}`)
  if (card) lines.push('', `Team card\n${card}`)
  const messaged = await tellTheTeam(admin, clientId, userId, lines.join('\n'))

  if (announcementId) {
    await admin.from('announcements').update({ plan, total_cents: total, status: errors.length && plan.length <= 1 ? 'planned' : 'in_progress', updated_at: new Date().toISOString() }).eq('id', announcementId)
  }
  return NextResponse.json({ ok: true, id: announcementId, plan, total, errors, messaged })
}
