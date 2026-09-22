/**
 * /api/dashboard/plan-month — the monthly plan (owner 2026-09-19). See src/lib/plan/month.ts.
 *
 *   GET  ?clientId=&month=YYYY-MM[&lean=&drop=a,b&add=kind:date]   the saved month, or a fresh draft
 *   POST { action: 'start', month, lean, drop, add }                 the month becomes real work
 *   POST { action: 'drop' | 'add', month, key | kind,date }          on a started month
 */
import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { createAdminClient } from '@/lib/supabase/admin'
import { draftMonth, loadMonth, startMonth, applyEdits, addTiles, loadActual, nextMonth, nextOf, saveMonth, preload, saveRhythm, loadRhythm, occasionsIn, type Edits, type Lean, type SlotKind, type Month, type Pre } from '@/lib/plan/month'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const LEANS: Lean[] = ['seen', 'asis', 'in']
const KINDS: SlotKind[] = ['post', 'graphic', 'reel', 'photos', 'creator', 'boost', 'print', 'offer', 'review', 'taste', 'sign', 'team']
const monthOk = (m: unknown): m is string => typeof m === 'string' && /^\d{4}-\d{2}$/.test(m)
const parseEdits = (o: { lean?: unknown; subject?: unknown; drop?: unknown; add?: unknown }): Edits => ({
  lean: LEANS.includes(o.lean as Lean) ? (o.lean as Lean) : undefined,
  subject: typeof o.subject === 'string' ? o.subject.trim().slice(0, 80) || null : undefined,
  drop: (Array.isArray(o.drop) ? o.drop : typeof o.drop === 'string' ? o.drop.split(',') : []).map(String).filter(Boolean),
  add: (Array.isArray(o.add) ? o.add : typeof o.add === 'string' ? o.add.split(',').filter(Boolean).map((x) => { const [kind, date] = x.split(':'); return { kind, date } }) : []).map((x) => ({ kind: String((x as { kind: unknown }).kind) as SlotKind, date: typeof (x as { date?: unknown }).date === 'string' ? String((x as { date?: unknown }).date) : undefined })).filter((x) => KINDS.includes(x.kind)),
})
const strip = (m: Month) => ({ ...m, facts: { usualReach: m.facts.usualReach, reelLift: m.facts.reelLift, reviews30: m.facts.reviews30, budgetCents: m.facts.budgetCents, locations: m.facts.locations }, tiles: addTiles(m) })

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const clientId = sp.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })
  const access = await checkClientAccess(clientId)
  if (!access.authorized) return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status: access.reason === 'unauthenticated' ? 401 : 403 })
  const admin = createAdminClient()
  const [probe, probe267] = await Promise.all([admin.from('plan_months').select('id').limit(1), admin.from('announcements').select('id').limit(1)])
  /* Start books a shoot day and a creator, which live on announcements (267). Off until both are in. */
  const off = !!probe.error || !!probe267.error
  const month = monthOk(sp.get('month')) ? sp.get('month')! : nextMonth()
  const saved = off ? null : await loadMonth(admin, clientId, month)
  const edits = parseEdits({ lean: sp.get('lean') ?? undefined, subject: sp.get('subject') ?? undefined, drop: sp.get('drop') ?? undefined, add: sp.get('add') ?? undefined })
  const pre: Pre | null = off ? null : await preload(admin, clientId)
  let m: Month
  if (saved && saved.status !== 'draft') m = saved
  else {
    /* a fresh draft, re-drawn with the lean when it changes (the lean shapes the slots) */
    const base = await draftMonth(admin, clientId, month, edits.lean ?? saved?.lean ?? 'asis', undefined, edits.subject ?? saved?.subject ?? null, pre ?? undefined)
    m = applyEdits(base, { drop: edits.drop, add: edits.add })
  }
  const actual = m.status === 'started' || m.status === 'done' ? await loadActual(clientId, month) : null
  /* the season: this month and the two after it, each with its occasions, so the holidays are in view */
  const season = await Promise.all([month, nextOf(month), nextOf(nextOf(month))].map(async (mm) => {
    const sv = mm === month ? m : off ? null : (await loadMonth(admin, clientId, mm)) ?? (await draftMonth(admin, clientId, mm, 'asis', undefined, null, pre ?? undefined))
    return { month: mm, status: sv?.status ?? 'draft', total: sv?.total ?? 0, subject: sv?.subject ?? null, pieces: (sv?.slots ?? []).filter((x) => x.kind !== 'post' && x.status !== 'removed').length, occasions: occasionsIn(mm) }
  }))
  const rhythm = pre ? await loadRhythm(admin, clientId, pre.facts) : null
  const days = (() => { const [y, mo] = month.split('-').map(Number); return new Date(Date.UTC(y, mo, 0)).getUTCDate() })()
  const today = new Date().toISOString().slice(0, 10)
  const elapsed = today < `${month}-01` ? 0 : Math.min(days, Number(today.slice(8, 10)) + (today.slice(0, 7) > month ? days : 0))
  return NextResponse.json({ month: strip(m), off, actual, elapsed, days, next: nextMonth(), season, rhythm: rhythm?.rhythm ?? m.rhythm, rhythmSet: rhythm?.set ?? false }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { clientId?: string; action?: string; month?: unknown; lean?: unknown; subject?: unknown; drop?: unknown; add?: unknown; key?: string; kind?: string; date?: string }
  const clientId = body.clientId
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })
  const access = await checkClientAccess(clientId)
  if (!access.authorized || !access.userId) return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status: access.reason === 'unauthenticated' ? 401 : 403 })
  const admin = createAdminClient()
  const [probe, probe267] = await Promise.all([admin.from('plan_months').select('id').limit(1), admin.from('announcements').select('id').limit(1)])
  if (probe.error || probe267.error) return NextResponse.json({ error: 'The monthly plan is not switched on yet' }, { status: 503 })
  const month = monthOk(body.month) ? body.month : nextMonth()

  if (body.action === 'start') {
    const have = await loadMonth(admin, clientId, month)
    if (have && have.status !== 'draft') return NextResponse.json({ error: `${month} is already started` }, { status: 409 })
    const edits = parseEdits(body)
    const m = applyEdits(await draftMonth(admin, clientId, month, edits.lean ?? 'asis', undefined, edits.subject ?? null), { drop: edits.drop, add: edits.add })
    const r = await startMonth(admin, clientId, access.userId, m)
    const fresh = await loadMonth(admin, clientId, month)
    return NextResponse.json({ ok: true, minted: r.minted, errors: r.errors, month: fresh ? strip(fresh) : strip(m) })
  }
  if (body.action === 'save') {
    const edits = parseEdits(body)
    const m = applyEdits(await draftMonth(admin, clientId, month, edits.lean ?? 'asis', undefined, edits.subject ?? null), { drop: edits.drop, add: edits.add })
    const id = await saveMonth(admin, clientId, access.userId, m, 'draft')
    return NextResponse.json({ ok: !!id, month: strip(m) })
  }
  if (body.action === 'rhythm') {
    const pre = await preload(admin, clientId)
    const r = await saveRhythm(admin, clientId, (body as { rhythm?: Record<string, unknown> }).rhythm ?? {}, pre.facts)
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 503 })
    return NextResponse.json({ ok: true })
  }
  if (body.action === 'subject') {
    const subject = typeof body.subject === 'string' ? body.subject.trim().slice(0, 80) || null : null
    const up = await admin.from('plan_months').update({ subject, ...(subject ? { thesis: subject } : {}), updated_at: new Date().toISOString() }).eq('client_id', clientId).eq('month', month)
    if (up.error && /subject/i.test(up.error.message)) await admin.from('plan_months').update({ ...(subject ? { thesis: subject } : {}), updated_at: new Date().toISOString() }).eq('client_id', clientId).eq('month', month)
    const fresh = await loadMonth(admin, clientId, month)
    return NextResponse.json({ ok: true, month: fresh ? strip(fresh) : null })
  }
  if (body.action === 'drop' || body.action === 'add') {
    const have = await loadMonth(admin, clientId, month)
    if (!have) return NextResponse.json({ error: 'No plan for that month' }, { status: 404 })
    if (body.action === 'drop') {
      const s = have.slots.find((x) => `${x.kind}:${x.date}` === body.key || x.id === body.key)
      if (!s?.id) return NextResponse.json({ error: 'That piece is not on the plan' }, { status: 404 })
      if (s.status === 'minted' || s.status === 'done') return NextResponse.json({ error: 'That piece is already with the team. Cancel it from its request.' }, { status: 409 })
      await admin.from('plan_slots').update({ status: 'removed', updated_at: new Date().toISOString() }).eq('id', s.id)
    } else {
      const kind = String(body.kind) as SlotKind
      if (!KINDS.includes(kind)) return NextResponse.json({ error: 'kind?' }, { status: 400 })
      const m = applyEdits(have, { add: [{ kind, date: typeof body.date === 'string' ? body.date : undefined }] })
      const added = m.slots.find((s) => !s.id)
      if (added) { const { data: id } = await admin.from('plan_months').select('id').eq('client_id', clientId).eq('month', month).maybeSingle(); if (id) await admin.from('plan_slots').insert({ plan_month_id: id.id, client_id: clientId, date: added.date, stage: added.stage, kind: added.kind, label: added.label, options: added.options, cents: added.cents, status: 'planned', why: added.why ?? null }) }
    }
    const fresh = await loadMonth(admin, clientId, month)
    return NextResponse.json({ ok: true, month: fresh ? strip(fresh) : null })
  }
  return NextResponse.json({ error: 'action?' }, { status: 400 })
}
