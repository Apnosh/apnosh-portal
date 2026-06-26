/**
 * Vercel Cron: reconcile the money ledgers. Finds every approved creator order
 * missing its owner charge or creator payout and accrues the gap — the durable
 * backstop that recovers anything a best-effort accrual dropped at approval time
 * (the money reviews deferred this recovery sweep to Phase 5).
 *
 * Idempotent (the accrue fns no-op if the charge/payout already exists), so running
 * it on any cadence is safe. Secret gate is identical to the other cron routes:
 * Vercel cron user-agent OR CRON_SECRET header/query param. Register a schedule in
 * vercel.json (e.g. hourly) to make recovery automatic.
 */
import { NextResponse } from 'next/server'
import { reconcileAccruals } from '@/lib/campaigns/work-orders'

export const runtime = 'nodejs'
export const maxDuration = 60

const CRON_SECRET = process.env.CRON_SECRET

export async function GET(req: Request) {
  const url = new URL(req.url)
  const querySecret = url.searchParams.get('secret')
  const headerSecret = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  const isVercelCron = req.headers.get('user-agent')?.includes('vercel-cron')

  if (!isVercelCron && querySecret !== CRON_SECRET && headerSecret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await reconcileAccruals().catch((e) => ({ error: e instanceof Error ? e.message : 'reconcile failed', ordersChecked: 0, chargesRecovered: 0, payoutsRecovered: 0 }))
  return NextResponse.json({ ok: true, ...result })
}
