/**
 * /api/dashboard/listing/health — listing health score + fix-it checklist
 * for the signed-in owner's client.
 */

import { NextResponse } from 'next/server'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { getListingHealth } from '@/lib/dashboard/get-listing-health'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET() {
  const { user, clientId } = await resolveCurrentClient()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!clientId) return NextResponse.json({ error: 'No client context' }, { status: 403 })

  const health = await getListingHealth(clientId)
  return NextResponse.json(health)
}
