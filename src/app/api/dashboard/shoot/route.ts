/**
 * /api/dashboard/shoot — the shoot day. See src/lib/shoot/day.ts.
 *
 *   GET  ?clientId=            the open shoot (or null), the tiers, and the upcoming plans that
 *                              could join it
 *   POST { action: 'book', items: [{label}], date?, note? }     the list decides the size
 *   POST { action: 'attach', shootId, label, kind, planId?, pieces? }
 *   POST { action: 'detach', shootId, index }
 */
import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { createAdminClient } from '@/lib/supabase/admin'
import { TIERS, TIER_LABEL, TIER_SMALL, SPOTS, PHOTOS, tierCents, asTier, openShoot, shootSuggestions, bookShoot, attachToShoot } from '@/lib/shoot/day'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })
  const access = await checkClientAccess(clientId)
  if (!access.authorized) return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status: access.reason === 'unauthenticated' ? 401 : 403 })
  const admin = createAdminClient()
  const shoot = await openShoot(admin, clientId)
  const tiers = TIERS.map((t) => ({ id: t, label: TIER_LABEL[t], small: TIER_SMALL[t], spots: SPOTS[t], photos: PHOTOS[t], cents: tierCents(t) }))
  return NextResponse.json({ shoot, suggest: await shootSuggestions(admin, clientId, shoot?.attached ?? []), tiers }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { clientId?: string; action?: string; tier?: string; items?: unknown; date?: string; note?: string; shootId?: string; label?: string; kind?: string; planId?: string; pieces?: unknown; index?: number }
  const clientId = body.clientId
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })
  const access = await checkClientAccess(clientId)
  if (!access.authorized || !access.userId) return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status: access.reason === 'unauthenticated' ? 401 : 403 })
  const admin = createAdminClient()

  if (body.action === 'book') {
    const date = typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : null
    const items = (Array.isArray(body.items) ? body.items : []).map((x) => (typeof x === 'string' ? { label: x } : { label: String((x as { label?: unknown })?.label ?? '') })).filter((x) => x.label.trim())
    const r = await bookShoot(admin, { clientId, userId: access.userId, ...(body.tier ? { tier: asTier(body.tier) } : {}), items, date, note: body.note })
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
    return NextResponse.json({ ok: true, shoot: r.shoot, needsPayment: r.needsPayment })
  }
  if (body.action === 'attach' || body.action === 'detach') {
    const shootId = typeof body.shootId === 'string' ? body.shootId : null
    if (!shootId) return NextResponse.json({ error: 'shootId required' }, { status: 400 })
    const shoot = body.action === 'attach'
      ? await attachToShoot(admin, clientId, shootId, { label: String(body.label ?? ''), kind: String(body.kind ?? 'plan'), planId: typeof body.planId === 'string' ? body.planId : null, pieces: (Array.isArray(body.pieces) ? body.pieces : []).map(String) })
      : await attachToShoot(admin, clientId, shootId, null, Number(body.index))
    if (!shoot) return NextResponse.json({ error: 'That shoot is not on file' }, { status: 404 })
    return NextResponse.json({ ok: true, shoot })
  }
  return NextResponse.json({ error: 'action required' }, { status: 400 })
}
