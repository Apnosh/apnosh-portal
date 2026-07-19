/**
 * Vercel Cron: poll campaign outcomes. Re-snapshots recently-shipped campaigns so each
 * piece's real reading builds a trajectory over time (the trend the verdict's stability
 * gate needs). Idempotent per day (the writer clears + rewrites today's rows), so any
 * cadence is safe. Secret gate is identical to the other cron routes. Register a daily
 * schedule in vercel.json (after the GBP/social syncs, so metrics are fresh).
 */
import { NextResponse } from 'next/server'
import { pollOutcomes } from '@/lib/campaigns/outcomes/reconcile'
import { sweepCampaignCompletions } from '@/lib/campaigns/completion'
import { sweepRecurringCycles } from '@/lib/campaigns/recurring-cycles'

export const runtime = 'nodejs'
export const maxDuration = 120

const CRON_SECRET = process.env.CRON_SECRET

export async function GET(req: Request) {
  const url = new URL(req.url)
  const querySecret = url.searchParams.get('secret')
  const headerSecret = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  const isVercelCron = req.headers.get('user-agent')?.includes('vercel-cron')

  if (!isVercelCron && querySecret !== CRON_SECRET && headerSecret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await pollOutcomes().catch((e) => ({ error: e instanceof Error ? e.message : 'poll failed', campaigns: 0, written: 0 }))
  // After fresh outcome snapshots land: wrap any campaign whose every piece is
  // done (stamps execution.wrapUpSentAt + sends the owner the grounded letter).
  const completions = await sweepCampaignCompletions().catch((e) => ({ error: e instanceof Error ? e.message : 'completion sweep failed', checked: 0, completed: 0, notified: 0 }))
  // Month-2+ of every ACTIVE campaign subscription mints its next cycle of real service
  // work (a billing month must never pass with no work object minted).
  const recurring = await sweepRecurringCycles().catch((e) => ({ error: e instanceof Error ? e.message : 'recurring sweep failed', subscriptions: 0, minted: 0 }))
  return NextResponse.json({ ok: true, ...result, completions, recurring })
}
