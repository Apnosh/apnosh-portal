/**
 * GET /api/dashboard/social-backfill?clientId=…&days=180
 * ======================================================
 * A one-time rewrite of the last N days of social_metrics from the vendor's own day-by-day
 * (see writeDailyMetrics). Owner-run: the daily sync only reaches ten days back, and the days
 * before it still carry the old between-sync growth numbers that read as zero. Idempotent:
 * running it twice writes the same rows twice.
 */
import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { backfillDailyMetrics } from '@/lib/channels/adapters/zernio'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })
  const access = await checkClientAccess(clientId)
  if (!access.authorized) {
    return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status: access.reason === 'unauthenticated' ? 401 : 403 })
  }
  const days = Math.max(1, Math.min(365, Number(req.nextUrl.searchParams.get('days') ?? 180) || 180))
  try {
    const r = await backfillDailyMetrics(clientId, days)
    return NextResponse.json({ ok: r.failed.length === 0, days, ...r })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'failed' }, { status: 502 })
  }
}
