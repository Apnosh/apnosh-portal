/**
 * Daily Vercel cron: refresh the cross_client_patterns materialized
 * view. Cheap operation (a few hundred rows at most). Closes the
 * AI-First Principle #7 loop ("cross-client learning").
 */

import { NextResponse } from 'next/server'
import { refreshPatterns } from '@/lib/agent/cross-client-patterns'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const CRON_SECRET = process.env.CRON_SECRET

export async function GET(req: Request) {
  const url = new URL(req.url)
  const querySecret = url.searchParams.get('secret')
  const headerSecret = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  const isVercelCron = req.headers.get('user-agent')?.includes('vercel-cron')
  if (!isVercelCron && querySecret !== CRON_SECRET && headerSecret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const result = await refreshPatterns()
  return NextResponse.json({ ok: result.refreshed, ...result })
}
