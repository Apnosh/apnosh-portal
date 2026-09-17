/**
 * /api/dashboard/reviews/kit — Get reviews, the honest version (owner 2026-09-17).
 *
 * GET ?clientId= : what we know. The rating and count on the listing, how many reviews a month
 *   they get (only with 90 days of data, else null), the last 30 days, how many wait for a reply,
 *   the Google write-a-review link, whether we run their website, the size of their list.
 *
 * POST { clientId, goal, also: ['print' | 'website' | 'team'][], card } : the plan, made real.
 *   The link and the QR card exist the moment this returns. A printed table tent is a print
 *   request. The link on the website is a team line. The staff card goes to everyone on the
 *   portal. The baseline count and the goal are kept on an announcements row (kind 'reviews')
 *   so the check-in in 30 days is a number against a number. No text asks and no email asks:
 *   there is no send rail, and a line that cannot happen is not on the plan.
 */
import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { createAdminClient } from '@/lib/supabase/admin'
import { createCreativeRequest } from '@/lib/requests/create'
import { notifyClientOwners } from '@/lib/notifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const day = (d: Date) => d.toISOString().slice(0, 10)

async function context(clientId: string) {
  const admin = createAdminClient()
  const since90 = new Date(Date.now() - 90 * 86400000).toISOString()
  const since30 = new Date(Date.now() - 30 * 86400000).toISOString()
  const [locs, client, site, r90, r30, unreplied, oldest, guests] = await Promise.all([
    admin.from('gbp_locations').select('location_name, place_id, is_primary, place_rating, place_rating_count').eq('client_id', clientId),
    admin.from('clients').select('name, website').eq('id', clientId).maybeSingle(),
    admin.from('site_settings').select('order_online_url').eq('client_id', clientId).maybeSingle(),
    admin.from('reviews').select('id', { count: 'exact', head: true }).eq('client_id', clientId).gte('posted_at', since90),
    admin.from('reviews').select('id', { count: 'exact', head: true }).eq('client_id', clientId).gte('posted_at', since30),
    admin.from('reviews').select('id', { count: 'exact', head: true }).eq('client_id', clientId).is('response_text', null),
    admin.from('reviews').select('posted_at').eq('client_id', clientId).order('posted_at', { ascending: true }).limit(1).maybeSingle(),
    admin.from('guest_contacts').select('id', { count: 'exact', head: true }).eq('client_id', clientId).is('unsubscribed_at', null),
  ])
  const rows = (locs.data ?? []) as { location_name: string; place_id: string | null; is_primary?: boolean; place_rating: number | null; place_rating_count: number | null }[]
  const primary = rows.find((r) => r.is_primary && r.place_id) ?? rows.find((r) => r.place_id) ?? rows[0]
  const placeId = primary?.place_id ?? null
  const oldestAt = oldest.data?.posted_at ? Date.parse(String(oldest.data.posted_at)) : null
  const monthsOfData = oldestAt ? (Date.now() - oldestAt) / (30 * 86400000) : 0
  const perMonth = monthsOfData >= 3 && (r90.count ?? 0) >= 3 ? Math.round(((r90.count ?? 0) / 3) * 10) / 10 : null
  return {
    name: (client.data?.name as string | undefined)?.trim() || primary?.location_name || 'your restaurant',
    rating: primary?.place_rating ?? null,
    count: primary?.place_rating_count ?? null,
    perMonth,
    last30: r30.count ?? 0,
    unreplied: unreplied.count ?? 0,
    placeId,
    reviewUrl: placeId ? `https://search.google.com/local/writereview?placeid=${placeId}` : null,
    website: (client.data?.website as string | null) ?? null,
    hasSite: !!(client.data?.website as string | null),
    guests: guests.count ?? 0,
    orderUrl: (site.data?.order_online_url as string | null) ?? null,
  }
}

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })
  const access = await checkClientAccess(clientId)
  if (!access.authorized) return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status: access.reason === 'unauthenticated' ? 401 : 403 })
  return NextResponse.json(await context(clientId), { headers: { 'Cache-Control': 'no-store' } })
}

interface Line { key: string; label: string; detail: string; date: string | null; cost: number | null; status: 'scheduled' | 'with_team' | 'needs_payment' | 'done' | 'later'; ref: { kind: string; id: string | null; href?: string } | null; why?: string }

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { clientId?: string; goal?: number; also?: unknown; card?: string; whys?: Record<string, unknown> }
  const clientId = body.clientId
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })
  const access = await checkClientAccess(clientId)
  if (!access.authorized || !access.userId) return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status: access.reason === 'unauthenticated' ? 401 : 403 })
  const userId = access.userId
  const admin = createAdminClient()
  const ctx = await context(clientId)
  const goal = Number.isFinite(Number(body.goal)) ? Math.max(1, Math.min(500, Math.round(Number(body.goal)))) : 20
  const also = (Array.isArray(body.also) ? body.also : []).filter((x): x is 'print' | 'website' | 'team' => ['print', 'website', 'team'].includes(String(x)))
  const card = String(body.card ?? '').trim().slice(0, 1200)
  const whys: Record<string, string> = {}
  for (const [k, v] of Object.entries(body.whys ?? {})) if (typeof v === 'string' && v.trim()) whys[k] = v.trim().slice(0, 140)
  const today = day(new Date())
  const checkin = day(new Date(Date.now() + 30 * 86400000))
  const plan: Line[] = []
  const errors: string[] = []

  if (!ctx.reviewUrl) return NextResponse.json({ error: 'No Google listing on file yet. Connect Google first.' }, { status: 400 })

  const { data: row } = await admin.from('announcements').insert({
    client_id: clientId, kind: 'reviews', status: 'in_progress',
    answers: { goal: String(goal), baseline: String(ctx.count ?? ''), rating: String(ctx.rating ?? ''), reviewUrl: ctx.reviewUrl },
    places: { also }, timing: { checkin }, words: { card }, created_by: userId,
  }).select('id').single()
  const announcementId = (row?.id as string | undefined) ?? null

  plan.push({ key: 'link', label: 'Your review link', detail: 'On the receipt, in the bio, in every thank-you', date: today, cost: null, status: 'done', ref: { kind: 'page', id: null, href: ctx.reviewUrl }, why: whys.link })
  plan.push({ key: 'qr', label: 'The counter card', detail: 'A QR to the link. Print it from here, or ask for a printed one', date: today, cost: null, status: 'done', ref: { kind: 'page', id: null, href: `/dashboard/reviews/card?clientId=${clientId}` }, why: whys.qr })
  if (also.includes('print')) {
    const r = await createCreativeRequest({ clientId, userId, type: 'print', due_date: day(new Date(Date.now() + 7 * 86400000)), answers: { what: `A counter card and a table tent with the Google review QR for ${ctx.name}`, printing: 'Yes, print and deliver', when: 'This week', notes: `The link: ${ctx.reviewUrl}. Announcement ${announcementId ?? ''}`.trim() } })
    if (r.ok) plan.push({ key: 'print', label: 'Printed table tents', detail: 'The team quotes it and ships it', date: day(new Date(Date.now() + 7 * 86400000)), cost: null, status: 'with_team', ref: { kind: 'request', id: r.row.id, href: `/dashboard/requests/${r.row.id}` }, why: whys.print })
    else errors.push(`The print request did not send: ${r.error}`)
  }
  if (also.includes('website') && ctx.hasSite) {
    const r = await createCreativeRequest({ clientId, userId, type: 'other', due_date: day(new Date(Date.now() + 5 * 86400000)), answers: { what: `Put the Google review link on the website: the footer and the order thank-you page. ${ctx.reviewUrl}`, when: 'This week' } })
    if (r.ok) plan.push({ key: 'website', label: 'The link on your website', detail: 'Footer and the thank-you page', date: day(new Date(Date.now() + 5 * 86400000)), cost: null, status: 'with_team', ref: { kind: 'request', id: r.row.id, href: `/dashboard/requests/${r.row.id}` }, why: whys.website })
    else errors.push(`The website line did not send: ${r.error}`)
  }
  if (also.includes('team') && card) {
    const r = await notifyClientOwners(clientId, { kind: 'client_request', title: 'The review ask, for the team', body: card.slice(0, 1000), link: '/dashboard/notifications' }).catch(() => ({ notified: 0 }))
    plan.push({ key: 'team', label: 'The team knows the ask', detail: r.notified > 1 ? `Sent to ${r.notified} people on the portal. Copy it for the rest` : 'Copy it for the team', date: today, cost: null, status: 'done', ref: null, why: whys.team })
  }
  if (ctx.unreplied > 0) plan.push({ key: 'reply', label: `Reply to the ${ctx.unreplied} waiting`, detail: 'Reply now, from Create', date: today, cost: null, status: 'later', ref: { kind: 'page', id: null, href: '/dashboard/campaigns/new' }, why: whys.reply ?? 'A listing that answers gets more reviews' })
  plan.push({ key: 'checkin', label: 'The check-in', detail: `${ctx.count != null ? `${ctx.count} reviews today` : 'Today\'s count'}, the goal is ${goal} more`, date: checkin, cost: null, status: 'later', ref: { kind: 'page', id: null, href: '/dashboard/insights' }, why: 'Google updates the count on the listing, so this one measures itself' })

  if (announcementId) await admin.from('announcements').update({ plan, updated_at: new Date().toISOString() }).eq('id', announcementId)
  return NextResponse.json({ ok: true, id: announcementId, plan, errors })
}
