/**
 * The proof composer, compute-on-read v1 (spec R-01: "This week on Google").
 *
 * Evaluates the last 7 full days against the 7 before them from gbp_metrics.
 * A card exists ONLY when the week beat the prior week and is non-zero —
 * silence otherwise (law L3). Attribution comes from the newest delivered
 * work order in the last 30 days (law L4: "Since ..."), omitted when none.
 * No table yet: read state lives client-side until the proof_cards table
 * ships with the archive.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function adminDb() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

function iso(d: Date): string { return d.toISOString().slice(0, 10) }

export async function GET(req: NextRequest) {
  const clientId = new URL(req.url).searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  const isAdmin = profile && ['admin', 'super_admin'].includes(profile.role)
  if (!isAdmin) {
    const { data: cu } = await adminDb()
      .from('client_users').select('client_id')
      .eq('auth_user_id', user.id).eq('client_id', clientId).maybeSingle()
    if (!cu) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  // Windows: last 7 full days ending yesterday, and the 7 before them.
  const end = new Date(); end.setUTCHours(0, 0, 0, 0)
  const curStart = new Date(end); curStart.setUTCDate(curStart.getUTCDate() - 7)
  const priorStart = new Date(end); priorStart.setUTCDate(priorStart.getUTCDate() - 14)

  const admin = adminDb()
  const { data: rows } = await admin
    .from('gbp_metrics')
    .select('date, directions, calls, location_id')
    .eq('client_id', clientId)
    .gte('date', iso(priorStart))
    .lt('date', iso(end))

  /* Law L3 guard: seeded demo rows (location_id 'demo-proof') may power the
   * card on a sandbox, but the card must SAY so. If any demo row contributes,
   * the whole card is labeled a sample. */
  const hasDemo = (rows ?? []).some((r) => r.location_id === 'demo-proof')

  const cur = { directions: 0, calls: 0 }
  const prior = { directions: 0, calls: 0 }
  const daily = new Map<string, number>()
  for (const r of rows ?? []) {
    const d = String(r.date)
    const dirs = Number(r.directions) || 0
    const calls = Number(r.calls) || 0
    if (d >= iso(curStart)) {
      cur.directions += dirs; cur.calls += calls
      daily.set(d, (daily.get(d) ?? 0) + dirs + calls)
    } else {
      prior.directions += dirs; prior.calls += calls
    }
  }
  const curTotal = cur.directions + cur.calls
  const priorTotal = prior.directions + prior.calls

  // Law L3: silence unless the week is real and better.
  if (curTotal === 0 || curTotal <= priorTotal) {
    return NextResponse.json({ card: null }, { headers: { 'Cache-Control': 'no-store' } })
  }

  // Spark: the 7 current days in order, zeros for missing days.
  const spark: number[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(curStart); d.setUTCDate(d.getUTCDate() + i)
    spark.push(daily.get(iso(d)) ?? 0)
  }

  // Attribution: newest delivered work order in the last 30 days.
  let attribution: string | undefined
  const since = new Date(end); since.setUTCDate(since.getUTCDate() - 30)
  const { data: wo } = await admin
    .from('service_work_orders')
    .select('title, delivered_at')
    .eq('client_id', clientId)
    .eq('status', 'delivered')
    .gte('delivered_at', since.toISOString())
    .order('delivered_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (wo?.delivered_at) {
    const dt = new Date(wo.delivered_at as string)
    const label = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    attribution = `Since ${wo.title} went live, ${label}.`
  }

  const parts: string[] = []
  if (cur.calls > 0) parts.push(`${cur.calls} call${cur.calls === 1 ? '' : 's'}`)
  parts.push(`${cur.directions} direction tap${cur.directions === 1 ? '' : 's'}`)

  return NextResponse.json({
    card: {
      id: `gbp-${iso(curStart)}`,
      label: hasDemo ? 'Sample · a week on Google' : 'This week on Google',
      big: parts.join(' · '),
      context: priorTotal > 0
        ? `Up from ${prior.calls} call${prior.calls === 1 ? '' : 's'} and ${prior.directions} tap${prior.directions === 1 ? '' : 's'} the week before.`
        : 'Your first tracked week.',
      attribution: hasDemo
        ? 'Demo numbers so you can see the card. Real weeks replace this.'
        : attribution,
      spark,
    },
  }, { headers: { 'Cache-Control': 'no-store' } })
}
