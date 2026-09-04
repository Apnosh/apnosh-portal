/**
 * GET /api/dashboard/calendar?clientId=&from=&to= — the owner's dated things as JSON
 * (posts, emails, shoots, content, tasks), for the Campaigns tab's Calendar view. The
 * tokened ICS feed at /api/calendar/feed serves phones; this serves the app.
 */
import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { getCalendar } from '@/lib/dashboard/get-calendar'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const clientId = url.searchParams.get('clientId') ?? ''
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })
  const access = await checkClientAccess(clientId)
  if (!access.authorized) return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status: access.reason === 'unauthenticated' ? 401 : 403 })
  const from = url.searchParams.get('from') ?? undefined
  const to = url.searchParams.get('to') ?? undefined
  try {
    const events = await getCalendar(clientId, { fromIso: from, toIso: to })
    return NextResponse.json({ events })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'calendar failed' }, { status: 502 })
  }
}
