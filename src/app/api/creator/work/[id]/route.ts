import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { getWorkOrder, getCreatorIdForUser } from '@/lib/campaigns/work-orders'
import { getCreatorBrief } from '@/lib/campaigns/creator-brief'

// One order's full executable brief. Scoped to the assigned creator OR the
// owner/team/admin (client access). First open generates the AI creative (a few
// seconds) and caches it; later loads are instant.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const order = await getWorkOrder(id)
  if (!order) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const access = await checkClientAccess(order.clientId)
  const isAssignedCreator = (await getCreatorIdForUser(user.id)) === order.creatorId
  if (!access.authorized && !isAssignedCreator) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const result = await getCreatorBrief(id)
  if (!result) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(result)
}
