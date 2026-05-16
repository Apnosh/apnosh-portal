/**
 * Daily Vercel cron: refresh agent client_facts for every client.
 *
 * Walks all clients, runs each fact extractor, upserts into
 * client_facts via setFact() which is conflict-aware -- so the cron
 * never clobbers a higher-confidence owner_stated fact.
 *
 * Wired in vercel.json.
 */

import { NextResponse } from 'next/server'
import { extractFactsForAllClients } from '@/lib/agent/fact-extractor'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

const CRON_SECRET = process.env.CRON_SECRET

export async function GET(req: Request) {
  const url = new URL(req.url)
  const querySecret = url.searchParams.get('secret')
  const headerSecret = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  const isVercelCron = req.headers.get('user-agent')?.includes('vercel-cron')
  if (!isVercelCron && querySecret !== CRON_SECRET && headerSecret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const report = await extractFactsForAllClients()
  return NextResponse.json({ ok: true, ...report })
}
