/**
 * GET /api/dashboard/pulse?clientId=...
 * Returns the three pulse cards (Customers, Reputation, Reach) ready
 * to render. Server-side computes both "live" and "no-data" states so
 * the dashboard never alarms on missing connections.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getPulseData } from '@/lib/dashboard/get-pulse-data'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })

  const access = await checkClientAccess(clientId)
  if (!access.authorized) {
    const status = access.reason === 'unauthenticated' ? 401 : 403
    return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status })
  }

  const data = await getPulseData(clientId)
  return NextResponse.json(data)
}
