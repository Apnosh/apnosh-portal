/**
 * POST /api/dashboard/work-rating — the owner rates one delivered piece of
 * creator work, once. Tenant-gated like every dashboard route: the caller must
 * pass checkClientAccess for the ORDER's client (owner / team / admin), and a
 * body clientId (when the UI sends one) must match the order's — a mismatch is
 * rejected, never silently corrected.
 *
 * The rules live in validateRating (work-ratings-core): delivered-or-approved
 * only, creator-produced only (real vendor UUID — internal-team pieces are not
 * ratable), integer stars 1..5, one rating per order (409 on a duplicate; the
 * unique index backstops the race).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { getWorkOrder } from '@/lib/campaigns/work-orders'
import { validateRating } from '@/lib/campaigns/work-ratings-core'
import { getRatingsForOrders, insertWorkRating } from '@/lib/campaigns/work-ratings'

export async function POST(req: NextRequest) {
  // Auth before any lookup: an anonymous caller learns nothing (not even
  // whether an order id exists) — same order as /api/creator/work.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as {
    orderId?: string
    clientId?: string
    stars?: unknown
    comment?: string
  }
  if (!body.orderId) return NextResponse.json({ error: 'orderId required' }, { status: 400 })

  const order = await getWorkOrder(body.orderId)
  if (!order) return NextResponse.json({ error: 'not found' }, { status: 404 })

  // Tenant gate: only someone with access to this order's client may act on it.
  const access = await checkClientAccess(order.clientId)
  if (!access.authorized) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const existing = await getRatingsForOrders([order.id])
  const verdict = validateRating(
    { clientId: order.clientId, creatorId: order.creatorId, status: order.status },
    body.clientId ?? order.clientId,   // explicit clientId must match; omitted = the order's own
    existing.has(order.id),
    body.stars,
  )
  if (!verdict.ok) return NextResponse.json({ error: verdict.error }, { status: verdict.status })

  const comment = typeof body.comment === 'string' && body.comment.trim() ? body.comment.trim().slice(0, 1000) : null
  const res = await insertWorkRating({
    workOrderId: order.id,
    creatorId: order.creatorId,
    clientId: order.clientId,
    campaignId: order.campaignId || null,
    stars: body.stars as number,
    comment,
  })
  if (!res.ok) {
    if (res.error === 'duplicate') return NextResponse.json({ error: 'you already rated this work' }, { status: 409 })
    return NextResponse.json({ error: res.error }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
