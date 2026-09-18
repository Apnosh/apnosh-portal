/**
 * POST /api/dashboard/announce-suggest { clientId, kind, facts:{price,hasMedia,hasVideo,limited,date,what}, budgetCents? }
 * → { items, me:{ usualReach, budgetCents, creator, connected } }
 * The picker's context lives here: what is connected, their usual reach, the budget on file,
 * who fits among creators, and what the last plan of this kind did.
 */
import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { createAdminClient } from '@/lib/supabase/admin'
import { suggestItems, type SuggestInput } from '@/lib/plan/suggest'
import { listInfluencers, fitInfluencers } from '@/lib/influencers/read'
import { getVendorSchedule } from '@/lib/marketplace/creator-schedule'
import { graphicOrderCents } from '@/lib/requests/create'
import { priceCreativeRequest } from '@/lib/requests/pricing'
import { getActiveRateCard } from '@/lib/design/price-sheet'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { clientId?: string; kind?: string; facts?: SuggestInput['facts']; budgetCents?: number | null }
  const clientId = body.clientId
  if (!clientId || !body.kind) return NextResponse.json({ error: 'clientId and kind required' }, { status: 400 })
  const access = await checkClientAccess(clientId)
  if (!access.authorized) return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status: access.reason === 'unauthenticated' ? 401 : 403 })
  const admin = createAdminClient()
  const [conns, biz, site, gbp, recent, last, card] = await Promise.all([
    admin.from('social_connections').select('platform').eq('client_id', clientId),
    admin.from('businesses').select('monthly_budget, city, state, cuisine').eq('client_id', clientId).maybeSingle(),
    admin.from('site_settings').select('order_online_url').eq('client_id', clientId).maybeSingle(),
    admin.from('gbp_locations').select('id').eq('client_id', clientId).limit(1),
    admin.from('social_posts').select('reach').eq('client_id', clientId).order('posted_at', { ascending: false }).limit(12),
    admin.from('announcements').select('plan, timing').eq('client_id', clientId).eq('kind', body.kind).eq('status', 'done').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    getActiveRateCard().catch(() => null),
  ])
  const plats = new Set(((conns.data ?? []) as { platform: string }[]).map((c) => c.platform))
  const reaches = ((recent.data ?? []) as { reach: number | null }[]).map((r) => Number(r.reach || 0)).filter((x) => x > 0).sort((x, y) => x - y)
  const usualReach = reaches.length ? reaches[Math.floor(reaches.length / 2)] : null
  const state = ((biz.data?.state as string | null) ?? 'WA').toUpperCase().slice(0, 2)
  const budgetCents = typeof body.budgetCents === 'number' ? Math.round(body.budgetCents) : typeof biz.data?.monthly_budget === 'number' && biz.data.monthly_budget > 0 ? Math.round(Number(biz.data.monthly_budget) * 100) : null
  /* who fits, and when they are free */
  let creator: SuggestInput['creator'] = null
  try {
    const cards = await listInfluencers(admin, state)
    const fit = fitInfluencers(cards, { cuisine: (biz.data?.cuisine as string | null) ?? null, city: (biz.data?.city as string | null) ?? null, state })
    const top = fit[0] ? cards.find((c) => c.slug === fit[0].slug) : null
    if (top) {
      const a = top.audience
      const sched = await getVendorSchedule(top.id, new Date().toISOString(), 10).catch(() => null)
      creator = { slug: top.slug, name: top.name, fromCents: top.fromCents, nearby: a?.avgViews && a?.localPct != null ? Math.round(a.avgViews * a.localPct / 100) : null, date: sched?.slots[0]?.date ?? null, tierName: null }
    }
  } catch { /* no creators is a fine answer */ }
  /* what the last plan of this kind did */
  let lastResult: SuggestInput['last'] = null
  const plan = (last.data?.plan as { key: string; cost?: number | null; outcome?: { text?: string; n?: number } }[] | null) ?? null
  if (plan) { const b = plan.find((l) => l.key === 'boost'); const r = plan.find((l) => l.key === 'results'); const m = r?.outcome?.text?.match(/\+?(\d+) (?:new )?followers/); lastResult = { boostCents: b?.cost ?? null, followers: m ? Number(m[1]) : null, text: r?.outcome?.text ?? null } }
  const graphic = card ? graphicOrderCents({ destinations: ['instagram-post', 'facebook-post'], tier: 2, photos: 'own' }, card.card) ?? 23100 : 23100
  const video = priceCreativeRequest('video', { what: 'x', filming: 'Use clips and photos I have', count: 'Just 1', when: 'No rush' })?.totalCents ?? 27500
  const shoot = priceCreativeRequest('photos', { what: 'Food and dishes', use: 'Social media', when: 'No rush' })?.totalCents ?? 38500
  const input: SuggestInput = {
    kind: body.kind, facts: body.facts ?? { hasMedia: false, hasVideo: false },
    connected: { instagram: plats.has('instagram'), facebook: plats.has('facebook'), google: (gbp.data ?? []).length > 0, website: false, ordering: !!site.data?.order_online_url, apps: false },
    usualReach, budgetCents, creator, last: lastResult, prices: { graphic, video, shoot, print: 2500 },
  }
  return NextResponse.json({ items: suggestItems(input), me: { usualReach, budgetCents, creator, connected: input.connected } }, { headers: { 'Cache-Control': 'no-store' } })
}
