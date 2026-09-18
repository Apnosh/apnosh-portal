/**
 * /api/dashboard/influencers — the influencer marketplace for a restaurant.
 *
 *   GET ?clientId=                      every creator nearby, with audience and a fit score
 *   GET ?clientId=&slug=                one creator, the whole profile plus open times
 *   GET ?clientId=&fit=1&goal=&max=     three that fit, ranked, a reason each
 *   POST { clientId, slug, listingSlug, tierName?, date?, start?, brief }   send the ask
 */
import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { createAdminClient } from '@/lib/supabase/admin'
import { listInfluencers, getInfluencer, fitInfluencers, type FitCtx } from '@/lib/influencers/read'
import { bookInfluencer, type Brief } from '@/lib/influencers/book'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function me(admin: ReturnType<typeof createAdminClient>, clientId: string) {
  const [biz, client, ig] = await Promise.all([
    admin.from('businesses').select('cuisine, city, state').eq('client_id', clientId).maybeSingle(),
    admin.from('clients').select('name').eq('id', clientId).maybeSingle(),
    admin.from('social_connections').select('*').eq('client_id', clientId).eq('platform', 'instagram').limit(1).maybeSingle(),
  ])
  return { name: (client.data?.name as string) ?? 'Your restaurant', cuisine: (biz.data?.cuisine as string | null) ?? null, city: (biz.data?.city as string | null) ?? null, state: ((biz.data?.state as string | null) ?? 'WA').toUpperCase().slice(0, 2), handle: (() => { const r = (ig.data ?? {}) as Record<string, unknown>; const h = r.account_name ?? r.username ?? r.handle ?? r.account_handle; return typeof h === 'string' ? h : null })() }
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams
  const clientId = q.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })
  const access = await checkClientAccess(clientId)
  if (!access.authorized) return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status: access.reason === 'unauthenticated' ? 401 : 403 })
  const admin = createAdminClient()
  const m = await me(admin, clientId)
  const slug = q.get('slug')
  if (slug) {
    const p = await getInfluencer(admin, slug, m.state)
    if (!p) return NextResponse.json({ error: 'Not on the marketplace' }, { status: 404 })
    return NextResponse.json({ profile: p, me: m }, { headers: { 'Cache-Control': 'no-store' } })
  }
  const cards = await listInfluencers(admin, m.state)
  const ctx: FitCtx = { cuisine: m.cuisine, city: m.city, state: m.state, goal: (q.get('goal') as FitCtx['goal']) ?? null, maxCents: q.get('max') ? Number(q.get('max')) : null }
  const fit = fitInfluencers(cards, ctx)
  if (q.get('fit')) return NextResponse.json({ fit: fit.slice(0, 3).map((f) => ({ ...f, card: cards.find((c) => c.slug === f.slug) })), me: m, total: cards.length }, { headers: { 'Cache-Control': 'no-store' } })
  return NextResponse.json({ cards, fit, me: m }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { clientId?: string; slug?: string; listingSlug?: string; tierName?: string; date?: string; start?: string; brief?: Brief }
  const clientId = body.clientId
  if (!clientId || !body.slug) return NextResponse.json({ error: 'clientId and slug required' }, { status: 400 })
  const access = await checkClientAccess(clientId)
  if (!access.authorized || !access.userId) return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status: access.reason === 'unauthenticated' ? 401 : 403 })
  const admin = createAdminClient()
  const m = await me(admin, clientId)
  const r = await bookInfluencer(admin, { clientId, userId: access.userId, slug: body.slug, listingSlug: body.listingSlug ?? '', tierName: body.tierName ?? null, date: typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : null, start: typeof body.start === 'string' && /^\d{2}:\d{2}$/.test(body.start) ? body.start : null, brief: body.brief ?? { try: '' }, restaurant: { name: m.name, handle: m.handle } })
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
  return NextResponse.json(r)
}
