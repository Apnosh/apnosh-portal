/**
 * /api/cron/plan-results — nightly: fill every plan line with what happened.
 *
 * Reads the posts, drafts, requests and listing counts the plans point at and writes the
 * outcomes back (src/lib/plan/results.ts). Coming up shows them under "What you got". Same auth
 * as every other cron here: Vercel's cron agent, or the secret.
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fillPlanResults } from '@/lib/plan/results'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60
const CRON_SECRET = process.env.CRON_SECRET

export async function GET(req: Request) {
  const url = new URL(req.url)
  const querySecret = url.searchParams.get('secret')
  const headerSecret = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  const isVercelCron = req.headers.get('user-agent')?.includes('vercel-cron')
  if (!isVercelCron && (!CRON_SECRET || (querySecret !== CRON_SECRET && headerSecret !== CRON_SECRET))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const admin = createAdminClient()
    const clientId = url.searchParams.get('clientId') ?? undefined
    const r = await fillPlanResults(admin, { clientId })
    return NextResponse.json({ ok: true, ...r })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'failed' }, { status: 500 })
  }
}
