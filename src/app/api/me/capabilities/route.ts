/**
 * GET /api/me/capabilities
 *
 * Returns the signed-in user's active roles plus the resolved "viewing
 * as" lens. Optional ?role= query param picks which lens is active
 * when the user has multiple capabilities. Used by the workspace
 * switcher in the dashboard top bar.
 *
 * Safe to call frequently — getMyCapabilities() is wrapped in React
 * cache() and only does a single small select.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { getMyCapabilities, getActiveRole } from '@/lib/auth/capabilities'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const roleParam = req.nextUrl.searchParams.get('role')
  const [all, active] = await Promise.all([
    getMyCapabilities(),
    getActiveRole(roleParam),
  ])
  return NextResponse.json({ all, active })
}
