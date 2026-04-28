/**
 * Vercel Cron: weekly AI Marketing Operator pass.
 *
 * Iterates every active client and triggers an analysisClient run.
 * Proposals land in proposed_actions, awaiting human approval.
 *
 * Schedule (configured in vercel.json): once per week.
 *
 * Auth: Vercel Cron user-agent OR Authorization: Bearer ${CRON_SECRET}
 *       OR ?secret=${CRON_SECRET} for manual triggering.
 */

import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { analyzeClient } from '@/lib/operator/analyze'

export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutes -- 11 clients × ~10s = ~2min

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const CRON_SECRET = process.env.CRON_SECRET

function adminDb() {
  return createAdminClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const querySecret = url.searchParams.get('secret')
  const headerSecret = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  const isVercelCron = req.headers.get('user-agent')?.includes('vercel-cron')

  if (!isVercelCron && querySecret !== CRON_SECRET && headerSecret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Optional ?clientId=... to run for a single client (manual debugging)
  const singleClientId = url.searchParams.get('clientId')

  const db = adminDb()
  let clientsQuery = db
    .from('clients')
    .select('id, name')
    .eq('status', 'active')

  if (singleClientId) {
    clientsQuery = clientsQuery.eq('id', singleClientId)
  }

  const { data: clients, error } = await clientsQuery
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const results: Array<{
    clientId: string
    clientName: string
    success: boolean
    proposalCount?: number
    costUsd?: number
    error?: string
  }> = []

  let totalCost = 0
  let totalProposals = 0

  // Sequential to stay well under Anthropic rate limits and Vercel timeout
  for (const client of clients ?? []) {
    const id = client.id as string
    const name = client.name as string
    try {
      const res = await analyzeClient({
        clientId: id,
        triggeredBy: 'cron',
        runType: 'weekly_analysis',
      })
      if (res.success) {
        totalCost += res.costUsd
        totalProposals += res.proposalCount
        results.push({
          clientId: id,
          clientName: name,
          success: true,
          proposalCount: res.proposalCount,
          costUsd: res.costUsd,
        })
      } else {
        results.push({ clientId: id, clientName: name, success: false, error: res.error })
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown error'
      results.push({ clientId: id, clientName: name, success: false, error: msg })
    }
  }

  return NextResponse.json({
    ok: true,
    clientsProcessed: results.length,
    totalProposals,
    totalCostUsd: Number(totalCost.toFixed(4)),
    results,
  })
}
