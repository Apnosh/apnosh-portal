/**
 * GET /api/dashboard/board?clientId= — the Campaigns tab's read (owner 2026-09-22): what needs
 * the owner, what is coming this week, and the state of next month's plan.
 *
 *   needs   the inbox's work items (approvals, delivered work, tasks, broken connections),
 *           orders awaiting payment, the plan's open slots within seven days, the shoot day
 *           and the creator visit within three days. Each with one action.
 *   week    the calendar's pieces dated in the next seven days
 *   next    next month's plan: none | draft | started
 */
import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { createAdminClient } from '@/lib/supabase/admin'
import { getInbox } from '@/lib/dashboard/get-inbox'
import { listPieces, type Piece } from '@/lib/pieces/read'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export interface NeedItem { id: string; kind: 'approve' | 'see' | 'pay' | 'there' | 'fill' | 'reconnect' | 'task'; /** the drawing to wear, when the kind alone does not say */ scene?: string; title: string; detail: string; action: string | null; href: string; when: string | null; slotId?: string; slotKind?: string; slotDate?: string }
const ymd = (d: Date) => d.toISOString().slice(0, 10)
const addDays = (iso: string, n: number) => ymd(new Date(Date.parse(iso + 'T12:00:00Z') + n * 86400000))
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const nice = (iso: string) => { const d = new Date(iso + 'T12:00:00Z'); return `${WD[d.getUTCDay()]} ${d.getUTCDate()}` }

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })
  const access = await checkClientAccess(clientId)
  if (!access.authorized) return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status: access.reason === 'unauthenticated' ? 401 : 403 })
  const admin = createAdminClient()
  const today = ymd(new Date())
  const [inbox, pieces] = await Promise.all([
    getInbox(clientId, access.userId ?? undefined).catch(() => []),
    listPieces(admin, clientId, today, addDays(today, 45)).catch(() => [] as Piece[]),
  ])
  const needs: NeedItem[] = []
  const openSoon: Piece[] = []
  for (const it of inbox) {
    if (it.kind === 'approval') needs.push({ id: `inbox:${it.id}`, kind: 'approve', title: it.title, detail: it.detail ?? (it.status ?? ''), action: 'Approve', href: it.href, when: it.whenIso })
    else if (it.kind === 'post_review') needs.push({ id: `inbox:${it.id}`, kind: 'see', title: it.title, detail: it.detail ?? '', action: 'See it', href: it.href, when: it.whenIso })
    else if (it.kind === 'connection') needs.push({ id: `inbox:${it.id}`, kind: 'reconnect', title: it.title, detail: it.detail ?? '', action: 'Reconnect', href: it.href, when: it.whenIso })
    else if (it.kind === 'task') needs.push({ id: `inbox:${it.id}`, kind: 'task', title: it.title, detail: it.detail ?? (it.status ?? ''), action: 'Open', href: it.href, when: it.whenIso })
  }
  for (const p of pieces) {
    if (p.state === 'needs' && p.source === 'request') needs.push({ id: p.id, kind: 'pay', title: p.label, detail: 'Waiting on payment before the team starts', action: 'Pay', href: p.href ?? '/dashboard/requests', when: p.date })
    /* open slots the owner can still fill: past the lock (three days out) and inside the week the
       team would otherwise fill; one line for all of them, not one per slot */
    if (p.source === 'slot' && p.fill === 'open' && p.date && p.date > addDays(today, 3) && p.date <= addDays(today, 8) && p.state === 'coming') openSoon.push(p)
    if ((p.kind === 'photos' || p.kind === 'creator') && p.date && p.date >= today && p.date <= addDays(today, 3) && p.state !== 'done') needs.push({ id: `there:${p.id}`, kind: 'there', scene: p.kind === 'photos' ? 'photos' : 'creator', title: p.kind === 'photos' ? 'Be there for the shoot' : `Host ${p.label.replace(/ visits$/, '')}`, detail: `${nice(p.date)} · ${p.kind === 'photos' ? 'dishes ready to plate, about two hours' : 'a table for two, the meal on the house'}`, action: null, href: p.href ?? '/dashboard/campaigns/calendar', when: p.date })
  }
  if (openSoon.length) { const first = openSoon.sort((a, b) => a.date!.localeCompare(b.date!))[0]; needs.push({ id: 'open-soon', kind: 'fill', title: openSoon.length === 1 ? `An open ${first.kind === 'reel' ? 'Reel' : first.kind} slot` : `${openSoon.length} open slots this week`, detail: openSoon.length === 1 ? `${nice(first.date!)} · the team fills it if you leave it` : `${openSoon.map((p) => nice(p.date!)).join(', ')} · the team fills them if you leave them`, action: openSoon.length === 1 ? 'Fill it' : 'Fill them', href: `/dashboard/campaigns/calendar?month=${first.month}`, when: first.date, slotId: first.slotId, slotKind: first.kind, slotDate: first.date ?? undefined }) }
  const rank: Record<NeedItem['kind'], number> = { approve: 0, see: 1, pay: 2, there: 3, fill: 4, reconnect: 5, task: 6 }
  needs.sort((a, b) => rank[a.kind] - rank[b.kind] || (a.when ?? '9').localeCompare(b.when ?? '9'))
  const week = pieces.filter((p) => p.date && p.date >= today && p.date <= addDays(today, 7) && p.state !== 'done' && p.state !== 'draft' && p.state !== 'stopped')
  /* next month's plan */
  const [y, m] = today.slice(0, 7).split('-').map(Number); const nextMonth = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}`
  const { data: nm } = await admin.from('plan_months').select('status').eq('client_id', clientId).eq('month', nextMonth).maybeSingle()
  const { data: tm } = await admin.from('plan_months').select('status, started_at').eq('client_id', clientId).eq('month', today.slice(0, 7)).maybeSingle()
  return NextResponse.json({ needs, week, next: { month: nextMonth, status: nm?.status ?? 'none' }, thisMonth: { month: today.slice(0, 7), status: tm?.status ?? 'none' } }, { headers: { 'Cache-Control': 'no-store' } })
}
