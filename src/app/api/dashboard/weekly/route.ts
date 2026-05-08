/**
 * GET /api/dashboard/weekly?clientId=...
 * Returns the past-7-days marketing activity for the dashboard's
 * "Your marketing this week" card. Wrapper around the server-only
 * helper getWeeklyActivity so the client component can fetch it.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getWeeklyActivity } from '@/lib/dashboard/get-weekly-activity'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })

  const access = await checkClientAccess(clientId)
  if (!access.authorized) {
    const status = access.reason === 'unauthenticated' ? 401 : 403
    return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status })
  }

  const activity = await getWeeklyActivity(clientId)
  return NextResponse.json(activity)
}
