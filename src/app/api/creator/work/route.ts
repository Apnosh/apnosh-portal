import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { listWorkOrdersForCreator, listWorkOrdersForCampaign, getWorkOrder, updateWorkOrder, type WorkOrderStatus } from '@/lib/campaigns/work-orders'
import { safeHref, IllegalTransition } from '@/lib/campaigns/work-orders-core'

// Every read/write is scoped to the caller's tenant: a campaign's or order's
// client must pass checkClientAccess (owner / team / admin). This closes the
// IDOR where any authenticated user could read or mutate any order by id.
//
// NOTE (test-grade creator side): the owner drives both ends today, so the
// owner's client-access covers accept/deliver on their own campaigns. When real
// creator auth lands (vendors.person_id = auth.uid()), add "OR caller is the
// assigned creator" to the PATCH gate and scope ?creator= to the caller's vendor.

const VALID: WorkOrderStatus[] = ['offered', 'accepted', 'in_progress', 'delivered', 'approved', 'revision', 'declined']

async function currentUserId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

export async function GET(req: NextRequest) {
  if (!(await currentUserId())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const creator = req.nextUrl.searchParams.get('creator')
  const campaign = req.nextUrl.searchParams.get('campaign')

  if (campaign) {
    const orders = await listWorkOrdersForCampaign(campaign)
    if (!orders.length) return NextResponse.json({ orders: [] })
    const access = await checkClientAccess(orders[0].clientId)
    if (!access.authorized) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    return NextResponse.json({ orders })
  }

  if (creator) {
    const orders = await listWorkOrdersForCreator(creator)
    // Keep only orders whose client the caller can access (own campaigns + admin).
    const clientIds = [...new Set(orders.map((o) => o.clientId))]
    const allowed = new Set<string>()
    await Promise.all(clientIds.map(async (cid) => { if ((await checkClientAccess(cid)).authorized) allowed.add(cid) }))
    return NextResponse.json({ orders: orders.filter((o) => allowed.has(o.clientId)) })
  }

  return NextResponse.json({ orders: [] })
}

export async function PATCH(req: NextRequest) {
  if (!(await currentUserId())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as { id?: string; status?: string; delivered_url?: string; note?: string }
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  if (body.status && !VALID.includes(body.status as WorkOrderStatus)) {
    return NextResponse.json({ error: 'bad status' }, { status: 400 })
  }
  if (body.delivered_url && !safeHref(body.delivered_url)) {
    return NextResponse.json({ error: 'delivery link must be a valid http(s) URL' }, { status: 400 })
  }

  const order = await getWorkOrder(body.id)
  if (!order) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const access = await checkClientAccess(order.clientId)
  if (!access.authorized) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  try {
    await updateWorkOrder(body.id, {
      ...(body.status ? { status: body.status as WorkOrderStatus } : {}),
      ...(body.delivered_url !== undefined ? { delivered_url: body.delivered_url } : {}),
      ...(body.note !== undefined ? { note: body.note } : {}),
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof IllegalTransition) return NextResponse.json({ error: e.message }, { status: 409 })
    return NextResponse.json({ error: e instanceof Error ? e.message : 'update failed' }, { status: 500 })
  }
}
