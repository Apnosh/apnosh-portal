/**
 * /api/dashboard/growth-plan — Influencers and Ads (owner 2026-09-17).
 *
 * GET ?clientId= : how many food creators are on the marketplace for their state, and the
 *   monthly marketing budget on file, so both sheets start from something true.
 *
 * POST { clientId, kind: 'influencers', ... } : "find one for me". There is no matching engine
 *   yet, only a team that knows the creators, so this is an honest team line: the ask with the
 *   goal, the comp, the window and what they should post, then you approve the pick, the visit,
 *   their post. Turnaround from the creator-collab clock.
 * POST { clientId, kind: 'ads', ... } : the platforms picked. Meta and TikTok can go live from
 *   the Boost screen on the client's own ad account, so those lines open Boost with the goal
 *   set, or say to connect the ad account first. Google has no adapter here, so it is a team
 *   line, priced as the paid-ads service is: a share of spend, billed at cost. The ad creative
 *   is an order through the desk when they want one.
 */
import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { createAdminClient } from '@/lib/supabase/admin'
import { createCreativeRequest } from '@/lib/requests/create'
import { withTurnaround } from '@/lib/plan/turnaround'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const day = (d: Date) => d.toISOString().slice(0, 10)
const clean = (s: unknown, max = 300) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
interface Line { key: string; label: string; detail: string; date: string | null; cost: number | null; status: 'scheduled' | 'with_team' | 'needs_payment' | 'done' | 'later'; ref: { kind: string; id: string | null; href?: string } | null; why?: string }

async function context(clientId: string) {
  const admin = createAdminClient()
  const [biz, listings] = await Promise.all([
    admin.from('businesses').select('monthly_budget, city, state').eq('client_id', clientId).maybeSingle(),
    admin.from('vendor_listings').select('vendor_id, vendors!inner(bookable, service_area)').eq('category', 'food_influencer').limit(500),
  ])
  const state = ((biz.data?.state as string | null) ?? 'WA').toUpperCase()
  const rows = (listings.data ?? []) as { vendor_id: string; vendors: { bookable: boolean; service_area: string[] | null } | { bookable: boolean; service_area: string[] | null }[] }[]
  const vendorIds = new Set<string>()
  for (const r of rows) { const v = Array.isArray(r.vendors) ? r.vendors[0] : r.vendors; if (v?.bookable && (v.service_area ?? []).includes(state)) vendorIds.add(r.vendor_id) }
  return { creators: vendorIds.size, state, monthlyBudget: (biz.data?.monthly_budget as number | null) ?? null, city: (biz.data?.city as string | null) ?? null }
}

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })
  const access = await checkClientAccess(clientId)
  if (!access.authorized) return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status: access.reason === 'unauthenticated' ? 401 : 403 })
  return NextResponse.json(await context(clientId), { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { clientId?: string; kind?: string; goal?: string; comp?: string; window?: string; post?: string; who?: string; platforms?: unknown; weekly?: number; weeks?: number; people?: number; creative?: boolean; live?: Record<string, boolean>; whys?: Record<string, unknown> }
  const clientId = body.clientId
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })
  const access = await checkClientAccess(clientId)
  if (!access.authorized || !access.userId) return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status: access.reason === 'unauthenticated' ? 401 : 403 })
  const userId = access.userId
  const admin = createAdminClient()
  const today = day(new Date())
  const whys: Record<string, string> = {}
  for (const [k, v] of Object.entries(body.whys ?? {})) if (typeof v === 'string' && v.trim()) whys[k] = v.trim().slice(0, 140)
  const plan: Line[] = []
  const errors: string[] = []
  let answers: Record<string, string> = {}
  let total = 0

  if (body.kind === 'influencers') {
    const goal = clean(body.goal, 120) || 'New faces'
    const comp = clean(body.comp, 80) || 'A meal on us'
    const window = clean(body.window, 80) || 'The next two weeks'
    const post = clean(body.post, 80) || 'A Reel and a Story'
    const who = clean(body.who, 200)
    answers = { what: `Find a local food creator for us: ${goal}`, goal, comp, window, post, who }
    const r = await createCreativeRequest({ clientId, userId, type: 'other', due_date: day(new Date(Date.now() + 5 * 86400000)), answers: { what: `Find one or two local food creators for ${goal.toLowerCase()}. Comp: ${comp}. When: ${window}. They post: ${post}.${who ? ` We like: ${who}.` : ''} Send two picks with why, then we book.`, when: 'This week' } })
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
    const href = `/dashboard/requests/${r.row.id}`
    plan.push({ key: 'ask', label: 'The team looks', detail: 'Two picks with a reason each: local, your kind of food, their audience', date: today, cost: null, status: 'with_team', ref: { kind: 'request', id: r.row.id, href }, why: whys.ask ?? 'There is no matching engine yet. People who know the creators do this by hand' })
    plan.push({ key: 'pick', label: 'You approve a pick', detail: 'One tap in your thread', date: day(new Date(Date.now() + 5 * 86400000)), cost: null, status: 'later', ref: { kind: 'request', id: r.row.id, href } })
    plan.push({ key: 'visit', label: 'The visit', detail: `${comp}. A date you both agree`, date: null, cost: null, status: 'later', ref: { kind: 'request', id: r.row.id, href }, why: whys.visit })
    plan.push({ key: 'post', label: 'Their post', detail: `${post}, tagged, and we repost it`, date: null, cost: null, status: 'later', ref: { kind: 'request', id: r.row.id, href } })
    plan.push({ key: 'results', label: 'What it did', detail: 'Their views and yours, and new followers, in Insights', date: null, cost: null, status: 'later', ref: { kind: 'page', id: null, href: '/dashboard/insights/posts' } })
  } else if (body.kind === 'ads') {
    const platforms = (Array.isArray(body.platforms) ? body.platforms : []).filter((p): p is 'meta' | 'tiktok' | 'google' => ['meta', 'tiktok', 'google'].includes(String(p)))
    if (!platforms.length) return NextResponse.json({ error: 'Pick at least one platform' }, { status: 400 })
    const weekly = Math.max(5, Math.min(2000, Math.round(Number(body.weekly) || 50)))
    const weeks = Math.max(1, Math.min(12, Math.round(Number(body.weeks) || 4)))
    const people = Math.max(0, Math.round(Number(body.people) || 0))
    const live = body.live && typeof body.live === 'object' ? body.live : {}
    answers = { what: `Ads on ${platforms.join(', ')}`, weekly: `$${weekly} a week`, weeks: `${weeks} weeks`, people: people ? `${people} people` : '' }
    const NAMES: Record<string, string> = { meta: 'Instagram and Facebook', tiktok: 'TikTok', google: 'Google' }
    for (const p of platforms) {
      if (p === 'google') {
        const r = await createCreativeRequest({ clientId, userId, type: 'other', due_date: day(new Date(Date.now() + 7 * 86400000)), answers: { what: `Run Google ads for us: $${weekly} a week for ${weeks} weeks${people ? `, aiming at about ${people} people` : ''}. Search and Maps, people nearby looking for dinner.`, when: 'This week' } })
        if (r.ok) plan.push({ key: 'google', label: 'Google ads', detail: `$${weekly} a week for ${weeks} weeks, run and tuned by the team. Ad spend at cost plus a share, $300 a month minimum`, date: day(new Date(Date.now() + 5 * 86400000)), cost: weekly * weeks * 100, status: 'with_team', ref: { kind: 'request', id: r.row.id, href: `/dashboard/requests/${r.row.id}` }, why: whys.google ?? 'Google is the one place people search with dinner already in mind' })
        else errors.push(`Google ads did not send: ${r.error}`)
        total += weekly * weeks * 100
      } else {
        const isLive = !!live[p]
        const href = `/dashboard/boost?platform=${p}${people ? `&goal=${people}` : ''}&daily=${Math.max(1, Math.round(weekly / 7))}&days=${weeks * 7}`
        plan.push({ key: p, label: `${NAMES[p]}: boost your best post`, detail: isLive ? `$${weekly} a week for ${weeks} weeks, from your own ad account. Open Boost and press go` : `Connect your ${NAMES[p]} ad account on Boost first, then this runs from it`, date: today, cost: weekly * weeks * 100, status: 'later', ref: { kind: 'page', id: null, href }, why: whys[p] ?? (p === 'meta' ? 'Your own followers see it free. Boost reaches the people nearby who do not follow yet' : 'TikTok needs $20 a day at least, and only your own posts can be boosted') })
        total += weekly * weeks * 100
      }
    }
    if (body.creative === true) {
      const r = await createCreativeRequest({ clientId, userId, type: 'ads', order: true, due_date: day(new Date(Date.now() + 7 * 86400000)), answers: { platform: platforms.includes('google') && (platforms.includes('meta') || platforms.includes('tiktok')) ? 'Both' : platforms.includes('google') ? 'Google' : 'Facebook and Instagram', push: clean(body.goal, 200) || 'More people nearby', level: 'Standard', when: 'This week' } })
      if (r.ok) { plan.push({ key: 'creative', label: 'The ad creative', detail: r.needsPayment ? 'One concept in every size. Pay to start' : 'One concept in every size', date: day(new Date(Date.now() + 5 * 86400000)), cost: r.orderCents, status: r.needsPayment ? 'needs_payment' : 'with_team', ref: { kind: 'request', id: r.row.id, href: `/dashboard/requests/${r.row.id}` }, why: whys.creative }); total += r.orderCents ?? 0 }
      else errors.push(`The ad creative did not send: ${r.error}`)
    }
    plan.push({ key: 'checkin', label: 'The check-in', detail: 'People reached, taps, and what each person cost, per platform', date: day(new Date(Date.now() + weeks * 7 * 86400000)), cost: null, status: 'later', ref: { kind: 'page', id: null, href: '/dashboard/boost' }, why: 'Ad numbers live in the ad account. Boost shows them; the team reports Google in your thread' })
  } else return NextResponse.json({ error: 'kind required' }, { status: 400 })

  const shaped = withTurnaround(plan)
  const { data: row } = await admin.from('announcements').insert({ client_id: clientId, kind: body.kind, status: 'in_progress', answers, plan: shaped, total_cents: total, created_by: userId }).select('id').single()
  return NextResponse.json({ ok: true, id: (row?.id as string | undefined) ?? null, plan: shaped, total, errors })
}
