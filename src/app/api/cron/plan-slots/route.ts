/**
 * /api/cron/plan-slots — daily: the month's pieces become requests a week before their date,
 * a month that has run is marked done, and the next month is drafted so the recap can seed it.
 * Same auth as every other cron here: Vercel's cron agent, or the secret.
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { mintDueSlots, draftMonth, saveMonth, nextMonth } from '@/lib/plan/month'

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
    const probe = await admin.from('plan_months').select('id').limit(1)
    if (probe.error) return NextResponse.json({ ok: true, off: true })
    const r = await mintDueSlots(admin)
    /* months that have run are done; their client gets next month drafted */
    const thisMonth = new Date().toISOString().slice(0, 7)
    const { data: past } = await admin.from('plan_months').select('id, client_id, created_by, month').eq('status', 'started').lt('month', thisMonth).limit(50)
    let closed = 0, seeded = 0
    for (const p of (past ?? []) as { id: string; client_id: string; created_by: string | null; month: string }[]) {
      await admin.from('plan_months').update({ status: 'done', updated_at: new Date().toISOString() }).eq('id', p.id)
      await admin.from('plan_slots').update({ status: 'rolled', updated_at: new Date().toISOString() }).eq('plan_month_id', p.id).eq('status', 'planned')
      closed++
      const nm = nextMonth()
      const { data: has } = await admin.from('plan_months').select('id').eq('client_id', p.client_id).eq('month', nm).maybeSingle()
      if (!has && p.created_by) { const d = await draftMonth(admin, p.client_id, nm, 'asis'); if (await saveMonth(admin, p.client_id, p.created_by, d, 'draft')) seeded++ }
    }
    return NextResponse.json({ ok: true, ...r, closed, seeded })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'failed' }, { status: 500 })
  }
}
