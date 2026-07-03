import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { actionFor } from '@/lib/gbp-apply/bindings'
import { runStepAction, prepareWrite } from '@/lib/gbp-apply/dispatch'

/**
 * POST /api/admin/service-work-orders/:id/sync — the machine does its whole part in one shot, so the
 * operator never clicks a button a computer could have clicked. For every step with a bound action:
 *   read bindings   → run live now. Completing reads (access check, baseline, review link) mark the
 *                     step done with the pulled value as its receipt. The verification status check
 *                     stores its result on the step (step.checked) without completing anything.
 *   write bindings  → prepare the AI draft ONLY where none exists yet (idempotent: an operator's
 *                     edited draft is never clobbered). Nothing is ever pushed here — sync reads and
 *                     drafts, never writes to Google.
 * Called on page open and from the header "Check again" link. Admin-only.
 */
async function requireAdmin(): Promise<NextResponse | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'not authenticated' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  return null
}

type StoredAction = { text: string; done: boolean; doneAt?: string }
type StoredStep = {
  id: string
  status?: string
  actions?: StoredAction[]
  applied?: unknown
  prepared?: { proposed: string; at: string }
  checked?: { at: string; summary: string; kind: string }
  [k: string]: unknown
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const denied = await requireAdmin()
  if (denied) return denied

  const svc = createAdminClient()
  const { data: row, error: readErr } = await svc
    .from('service_work_orders')
    .select('campaign_id, client_id, service_id, status, steps, updated_at')
    .eq('id', id)
    .maybeSingle()
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 })
  if (!row) return NextResponse.json({ error: 'work order not found' }, { status: 404 })
  // A delivered order is finished; nothing to sync, no Google or model calls spent.
  if (row.status === 'delivered') return NextResponse.json({ ok: true, checkedAt: new Date().toISOString(), changed: false, notes: [] })

  const clientId = row.client_id as string
  const serviceId = row.service_id as string
  const steps: StoredStep[] = Array.isArray(row.steps) ? (row.steps as StoredStep[]) : []
  const nowISO = new Date().toISOString()
  let changed = false
  const notes: string[] = []

  const next: StoredStep[] = []
  for (const s of steps) {
    const action = actionFor(serviceId, s.id)
    if (!action) { next.push(s); continue }

    // Reads: run live. Completing reads finish the step; the verification check records itself and,
    // once Google confirms AND the operator's own bullets are done, completes the gated step too.
    if (action.kind === 'read' && s.status !== 'done') {
      // Already-confirmed verification never re-hits Google on every open.
      if (action.handler === 'voiceOfMerchant' && s.checked?.kind === 'verified') { next.push(s); continue }
      const result = await runStepAction(clientId, action)
      if (action.handler === 'voiceOfMerchant') {
        const kind = (result.detail?.kind as string) ?? 'error'
        const summary = result.summary ?? result.reason ?? result.error ?? ''
        const bulletsDone = (s.actions ?? []).length > 0 && (s.actions ?? []).every((a) => a.done)
        if (kind === 'verified' && bulletsDone) {
          // The gate cleared and the operator's work is done: the step is honestly complete.
          next.push({ ...s, status: 'done', checked: { at: nowISO, summary, kind }, applied: { at: nowISO, summary, proofUrl: null, detail: result.detail ?? null } })
          changed = true
          notes.push(`${s.id}: verified, done`)
        } else if (s.checked?.kind !== kind || s.checked?.summary !== summary) {
          // Only a real state change writes; a same-state re-check is free.
          next.push({ ...s, checked: { at: nowISO, summary, kind } })
          changed = true
        } else {
          next.push(s)
        }
        continue
      }
      if (result.ok) {
        next.push({
          ...s,
          status: 'done',
          actions: (s.actions ?? []).map((a) => ({ ...a, done: true, doneAt: a.doneAt ?? nowISO })),
          applied: { at: nowISO, summary: result.summary ?? '', proofUrl: result.proofUrl ?? null, detail: result.detail ?? null },
        })
        changed = true
        notes.push(`${s.id}: done`)
        continue
      }
      // A failed read (e.g. not connected yet) just stays open; the pile classifier handles it.
      next.push(s)
      continue
    }

    // Writes: draft once, never clobber. Only steps whose push path is actually wired get a draft.
    if (action.kind === 'write' && s.status !== 'done' && !s.prepared?.proposed) {
      const prep = await prepareWrite(clientId, action)
      if (prep.ok && typeof prep.proposed === 'string') {
        next.push({ ...s, prepared: { proposed: prep.proposed, at: nowISO } })
        changed = true
        notes.push(`${s.id}: drafted`)
        continue
      }
    }
    next.push(s)
  }

  if (changed) {
    // Optimistic concurrency: if an operator's edit landed while our reads were in flight, we skip
    // this write rather than revert theirs — sync's reads are idempotent and re-run on the next open.
    const { data: writeRes, error: uerr } = await svc
      .from('service_work_orders')
      .update({ steps: next, updated_at: nowISO })
      .eq('id', id)
      .eq('updated_at', row.updated_at as string)
      .select('id')
    if (uerr) return NextResponse.json({ error: uerr.message }, { status: 500 })
    if (!writeRes || writeRes.length === 0) {
      return NextResponse.json({ ok: true, checkedAt: nowISO, changed: false, notes: ['skipped: the order changed while checking'] })
    }
    if (row.campaign_id) revalidatePath(`/admin/campaign-orders/${row.campaign_id}`)
    revalidatePath(`/admin/work-orders/${id}`)
  }

  return NextResponse.json({ ok: true, checkedAt: nowISO, changed, notes })
}
