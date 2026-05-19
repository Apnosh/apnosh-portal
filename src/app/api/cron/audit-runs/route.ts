/**
 * Weekly cron: run + persist the Apnosh Score audit for every active
 * paying client. Score history powers the trend display + week-over-week
 * "+12 this week" badge on /dashboard/audit.
 *
 * Wire in vercel.json at Sunday 6am UTC (Saturday night PT) so owners
 * see fresh scores Monday morning. Skips Free + Inactive tiers (no
 * point burning AI tokens on prospects).
 */

import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { runAudit } from '@/lib/audit'

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

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  /* Run for paying tiers only — basic, standard, pro. Skip 'starter'
     (Free) and 'Internal' to save AI tokens. */
  const { data: clients } = await admin
    .from('clients')
    .select('id, name')
    .neq('status', 'churned')
    .in('tier', ['basic', 'standard', 'pro'])
    .order('created_at', { ascending: true })

  const report = {
    scanned: (clients ?? []).length,
    succeeded: 0,
    failed: 0,
    errors: [] as Array<{ clientId: string; message: string }>,
  }

  for (const c of (clients ?? []) as Array<{ id: string; name: string }>) {
    try {
      const { data: profile } = await admin
        .from('client_profiles')
        .select('cuisine')
        .eq('client_id', c.id)
        .maybeSingle() as { data: { cuisine: string | null } | null }

      await runAudit(c.id, {
        persist: true,
        withNarrative: true,
        restaurantName: c.name,
        cuisine: profile?.cuisine ?? null,
      })
      report.succeeded += 1
    } catch (err) {
      report.failed += 1
      report.errors.push({ clientId: c.id, message: (err as Error).message })
    }
  }

  return NextResponse.json({ ok: true, ...report })
}
