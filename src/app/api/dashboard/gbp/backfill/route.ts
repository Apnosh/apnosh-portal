/**
 * POST /api/dashboard/gbp/backfill — pull historical Performance API
 * data into gbp_metrics. Defaults to 18 months back (Google's max
 * retention). Use sparingly — each call hits Google ~5x per
 * location per month and counts against the per-day quota.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { backfillClientGbpMetrics } from '@/lib/gbp-backfill'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300  /* up to 5 min for 18 months × N locations */

export async function POST(req: NextRequest) {
  const { user, clientId } = await resolveCurrentClient()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!clientId) return NextResponse.json({ error: 'No client context' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as { monthsBack?: number }
  const monthsBack = Math.min(Math.max(1, body.monthsBack ?? 18), 18)

  const result = await backfillClientGbpMetrics(clientId, monthsBack)
  return NextResponse.json(result)
}
