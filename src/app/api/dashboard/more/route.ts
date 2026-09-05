/**
 * GET  /api/dashboard/more?clientId=…  — everything the More tab shows about this business:
 *      the profile facts (logo, cuisine, city, hours, goals), the owner's settings
 *      (approve-first, favorites), the people they have worked with, and delivered work
 *      still waiting for a rating.
 * POST /api/dashboard/more            — { clientId, approveFirst?, favorites? } saves those
 *      two settings. Favorites live in businesses.preferences (jsonb), approve-first in
 *      businesses.approval_preferences.auto_approve (the same flag the old Settings toggle
 *      wrote), so nothing needs a migration.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { getActiveClientGoals, getGoalsCatalog } from '@/lib/goals/queries'
import { getRatingsForOrders } from '@/lib/campaigns/work-ratings'
import { creatorNamesByIds } from '@/lib/campaigns/vendor-supply'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })
  const access = await checkClientAccess(clientId)
  if (!access.authorized) return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status: access.reason === 'unauthenticated' ? 401 : 403 })

  const admin = createAdminClient()
  const [client, biz, gbp, goals, catalog, orders] = await Promise.all([
    admin.from('clients').select('name, location, tier').eq('id', clientId).maybeSingle(),
    admin.from('businesses').select('logo_url, cuisine, cuisine_other, preferences, approval_preferences').eq('client_id', clientId).maybeSingle(),
    admin.from('gbp_locations').select('hours, address').eq('client_id', clientId).limit(1).maybeSingle(),
    getActiveClientGoals(clientId).catch(() => []),
    getGoalsCatalog().catch(() => []),
    admin.from('work_orders').select('id, title, discipline, creator_id, status, updated_at, campaign_id').eq('client_id', clientId).in('status', ['delivered', 'approved']).order('updated_at', { ascending: false }).limit(60),
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
    settings: { approveFirst: !(approval.auto_approve === true), favorites },
    people: [...peopleMap.values()],
    toRate,
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
