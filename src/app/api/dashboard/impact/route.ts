/**
 * /api/dashboard/impact — auto-generated monthly impact summary for the
 * signed-in owner's client.
 */

import { NextResponse } from 'next/server'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { getImpactSummary } from '@/lib/dashboard/get-impact-summary'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const { user, clientId } = await resolveCurrentClient()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!clientId) return NextResponse.json({ error: 'No client context' }, { status: 403 })

  const summary = await getImpactSummary(clientId)
  return NextResponse.json(summary)
}
