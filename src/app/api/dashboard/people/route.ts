/**
 * GET /api/dashboard/people?clientId=…[&with=lag,ask]  →  { people, replyLagMinutesMedian, latestAsk }
 *
 * The people on this client's live work: who owns each order, what they are on, and the thread to
 * reach them in. Home's people row reads this (components/mvp/people-row.tsx), so "every minted
 * order has a name on it" is now something the owner sees, not only something you can check.
 *
 * `with` names the EXTRA reads a caller wants, and defaults to none, because they are not
 * free: the median lag is a thousand message rows and the latest ask is three hundred, and
 * Home's people row (the busiest caller) draws neither. Get help asks for `ask` and gets
 * only that.
 *
 * Same auth pattern as the promises route: admins pass, an owner only for their own client.
 */
import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { getOrderPeople } from '@/lib/team/people'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const params = new URL(req.url).searchParams
  const clientId = params.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })
  const want = new Set((params.get('with') ?? '').split(',').map((s) => s.trim()).filter(Boolean))
  const access = await checkClientAccess(clientId)
  if (!access.authorized) {
    return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status: access.reason === 'unauthenticated' ? 401 : 403 })
  }
  try {
    const data = await getOrderPeople(clientId, { lag: want.has('lag'), ask: want.has('ask') })
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    // A missing table or a read hiccup means "nobody known", never a 500 on a read.
    console.warn('[people] read failed', (e as Error)?.message)
    return NextResponse.json({ people: [], replyLagMinutesMedian: null, latestAsk: null })
  }
}
