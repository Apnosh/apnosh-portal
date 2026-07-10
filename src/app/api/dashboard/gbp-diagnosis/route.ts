/**
 * GET /api/dashboard/gbp-diagnosis?clientId=…
 *
 * Runs the read-only GBP diagnosis engine (src/lib/gbp-diagnose.ts):
 * reads the owner's live Google Business Profile and grades it section
 * by section. No writes, no AI drafting — just what is there today.
 *
 * Auth: same checkClientAccess pattern as GET /api/campaigns.
 */

import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { diagnoseGbp } from '@/lib/gbp-diagnose'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

function denied(reason: string | undefined) {
  return NextResponse.json({ error: reason ?? 'forbidden' }, { status: reason === 'unauthenticated' ? 401 : 403 })
}

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })
  const access = await checkClientAccess(clientId)
  if (!access.authorized) return denied(access.reason)

  try {
    const diagnosis = await diagnoseGbp(clientId)
    return NextResponse.json(diagnosis)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'diagnosis failed' },
      { status: 500 },
    )
  }
}
