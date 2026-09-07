/**
 * GET /api/dashboard/people?clientId=…  →  { people: OrderPerson[], replyLagMinutesMedian }
 *
 * The people on this client's live work: who owns each order, what they are on, and the thread to
 * reach them in. No UI reads this yet (the avatar row is a later move) — it exists so "every
 * minted order has a name on it" is something you can check, and so the reply timer runs dark
 * where it can be watched before it is ever shown to an owner.
 *
 * Same auth pattern as the promises route: admins pass, an owner only for their own client.
 */
import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { getOrderPeople } from '@/lib/team/people'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const clientId = new URL(req.url).searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })
  const access = await checkClientAccess(clientId)
  if (!access.authorized) {
    return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status: access.reason === 'unauthenticated' ? 401 : 403 })
  }
  try {
    const data = await getOrderPeople(clientId)
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    // A missing table or a read hiccup means "nobody known", never a 500 on a read.
    console.warn('[people] read failed', (e as Error)?.message)
    return NextResponse.json({ people: [], replyLagMinutesMedian: null })
  }
}
