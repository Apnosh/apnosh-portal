/**
 * GET /api/dashboard/team?clientId=...
 *
 * The people on this client's account (name, photo, roles), for the Messages avatar row
 * (owner 2026-09-04: "profile icons of people at the top, recommended people to message").
 * Same access check as every dashboard read; same loader the Team page uses.
 */
import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { getTeamForClient } from '@/lib/dashboard/get-team'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })
  const access = await checkClientAccess(clientId)
  if (!access.authorized) return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status: access.reason === 'unauthenticated' ? 401 : 403 })
  const team = await getTeamForClient(clientId)
  return NextResponse.json({
    people: team.map((m) => ({ id: m.personId, name: m.displayName, avatarUrl: m.avatarUrl, roles: m.roles, primary: m.isPrimaryContact, availability: m.availability })),
  }, { headers: { 'Cache-Control': 'no-store' } })
}
