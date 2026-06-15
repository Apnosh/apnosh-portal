/**
 * Vercel Cron: daily social metrics sync.
 *
 * Invokes the `sync-social-metrics` Supabase Edge Function (which pulls
 * Instagram + Facebook Page insights into social_metrics). The function was
 * never scheduled, so social data only ever appeared when triggered by hand —
 * this wires it to run daily for every connected client (no body = sync all,
 * incremental).
 */

import { NextResponse } from 'next/server'

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

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ ok: false, error: 'Missing Supabase env' }, { status: 500 })
  }

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/sync-social-metrics`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}), // no client_id = all clients, incremental
    })
    const body = await res.json().catch(() => ({}))
    return NextResponse.json({ ok: res.ok, status: res.status, result: body })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'social sync invoke failed'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
