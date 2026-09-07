/**
 * GET /api/dashboard/people?clientId=…  →  { people: OrderPerson[], replyLagMinutesMedian }
 *
 * The people on this client's live work: who owns each order, what they are on, and the thread to
 * reach them in. Home's people row reads this (components/mvp/people-row.tsx), so "every minted
 * order has a name on it" is now something the owner sees, not only something you can check.
 *
 * Also carries `latestAsk` — the owner's most recent question and whether it has been answered
 * — which is what the Get help page's reply clock reads.
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
    return NextResponse.json({ people: [], replyLagMinutesMedian: null, latestAsk: null })
  }
}
