/**
 * GET  /api/dashboard/reviews/themes — returns cached themes; if
 *      stale or missing, generates fresh ones in the request (~5s).
 * POST /api/dashboard/reviews/themes — force regenerate.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { getCachedThemes, generateThemesForClient } from '@/lib/review-themes'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET(req: NextRequest) {
  const { user, clientId } = await resolveCurrentClient()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!clientId) return NextResponse.json({ error: 'No client context' }, { status: 403 })

  const locationId = req.nextUrl.searchParams.get('locationId')
  try {
    const cached = await getCachedThemes(clientId, locationId)
    if (cached) return NextResponse.json(cached)
    const fresh = await generateThemesForClient(clientId, locationId)
    return NextResponse.json(fresh)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const { user, clientId } = await resolveCurrentClient()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!clientId) return NextResponse.json({ error: 'No client context' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as { locationId?: string }
  try {
    const fresh = await generateThemesForClient(clientId, body.locationId ?? null)
    return NextResponse.json(fresh)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
