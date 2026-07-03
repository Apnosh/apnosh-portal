import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { actionFor } from '@/lib/gbp-apply/bindings'
import { runStepAction, prepareWrite, pushWrite } from '@/lib/gbp-apply/dispatch'

/**
 * POST /api/admin/service-work-orders/:id/apply — run ONE step's bound Google action for this order's
 * client. Body { stepId, mode?, value?, consent? }:
 *   read action         → runs live; on success the pulled value is stored as the step's proof and the
 *                         step is marked done (except the verification status check, which only reports).
 *   write, mode:prepare → AI-drafts the value + reads the current live value; persisted on the step as
 *                         step.prepared so the push is provably review-first. Nothing is written.
 *   write, mode:push    → the LIVE write. Requires consent:true AND a prior prepare on this step; the
 *                         value is re-validated server-side inside pushWrite. The step is marked done
 *                         ONLY when the read-back confirms the value is live; otherwise the outcome is
 *                         stored honestly (verified:false) and the step stays open for a re-check.
 * Admin-only. Unknown modes are rejected, and any future mutating mode inherits the consent gate.
 */
async function requireAdmin(): Promise<{ userId: string } | NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'not authenticated' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  return { userId: user.id }
}

type StoredAction = { text: string; done: boolean; doneAt?: string }
type StoredStep = { id: string; status?: string; actions?: StoredAction[]; applied?: unknown; prepared?: { proposed: string; at: string }; [k: string]: unknown }

/** Persist a change onto one step. completes=true also checks the step + its bullets off. Guarded by
 *  optimistic concurrency: if the row changed since we read it (the sync or another operator), the
 *  write loses loudly (409) instead of silently reverting someone else's work — which matters most
 *  when a push already landed on Google and only the receipt needs re-recording. */
async function saveStep(
  svc: ReturnType<typeof createAdminClient>,
  id: string,
  campaignId: string | null,
  readUpdatedAt: string,
  steps: StoredStep[],
  stepId: string,
  patch: Partial<StoredStep>,
  completes: boolean,
): Promise<NextResponse | null> {
  const nowISO = new Date().toISOString()
  const next = steps.map((s) => {
    if (s.id !== stepId) return s
    const merged = { ...s, ...patch }
    if (completes) {
      merged.status = 'done'
      merged.actions = (s.actions ?? []).map((a) => ({ ...a, done: true, doneAt: a.doneAt ?? nowISO }))
    }
    return merged
  })
  const { data: writeRes, error } = await svc
    .from('service_work_orders')
    .update({ steps: next, updated_at: nowISO })
    .eq('id', id)
    .eq('updated_at', readUpdatedAt)
    .select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!writeRes || writeRes.length === 0) {
    return NextResponse.json({ error: 'This order changed while you were working. Refresh and try again. If you just pushed, the change DID reach Google; only the record needs a refresh.' }, { status: 409 })
  }
  if (campaignId) revalidatePath(`/admin/campaign-orders/${campaignId}`)
  return null
}

const MODES = new Set(['run', 'prepare', 'push'])

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const body = await req.json().catch(() => ({}))
  const stepId = typeof body?.stepId === 'string' ? body.stepId : null
  const mode = typeof body?.mode === 'string' ? body.mode : 'run'
  if (!stepId) return NextResponse.json({ error: 'stepId is required' }, { status: 400 })
  if (!MODES.has(mode)) return NextResponse.json({ error: 'unknown mode' }, { status: 400 })

  const svc = createAdminClient()
  const { data: row, error: readErr } = await svc
    .from('service_work_orders')
    .select('campaign_id, client_id, service_id, steps, updated_at')
    .eq('id', id)
    .maybeSingle()
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 })
  if (!row) return NextResponse.json({ error: 'work order not found' }, { status: 404 })

  const action = actionFor(row.service_id as string, stepId)
  if (!action) return NextResponse.json({ error: 'this step has no automatic action' }, { status: 400 })
  const clientId = row.client_id as string
  const campaignId = (row.campaign_id as string | null) ?? null
  const steps: StoredStep[] = Array.isArray(row.steps) ? (row.steps as StoredStep[]) : []
  const step = steps.find((s) => s.id === stepId)
  if (!step) return NextResponse.json({ error: 'step not found on this work order' }, { status: 404 })

  // ── WRITE: prepare (safe, persisted) or push (live, consent-gated, review-bound) ──
  if (action.kind === 'write') {
    if (mode === 'prepare') {
      const prep = await prepareWrite(clientId, action)
      if (prep.ok && typeof prep.proposed === 'string') {
        const fail = await saveStep(svc, id, campaignId, row.updated_at as string, steps, stepId, { prepared: { proposed: prep.proposed, at: new Date().toISOString() } }, false)
        if (fail) return fail
      }
      return NextResponse.json(prep)
    }
    // mode === 'push' — every mutating mode requires explicit consent and a prior prepare.
    if (body?.consent !== true) return NextResponse.json({ error: 'This writes to the live Google profile, so it needs your explicit confirmation.' }, { status: 400 })
    if (!step.prepared?.proposed) return NextResponse.json({ error: 'Prepare and review the draft first. A push always follows a review.' }, { status: 400 })
    const value = typeof body?.value === 'string' ? body.value : ''
    const result = await pushWrite(clientId, action, value)
    if (result.ok) {
      const verified = result.detail?.verified === true
      const applied = {
        at: new Date().toISOString(),
        summary: result.summary ?? '',
        requested: result.detail?.sent ?? value,
        confirmed: result.detail?.readBack ?? null,
        verified,
        by: auth.userId,
        consent: true,
      }
      // Done only when the read-back confirms it. A pending/unconfirmed write stays open, honestly.
      const fail = await saveStep(svc, id, campaignId, row.updated_at as string, steps, stepId, { applied }, verified)
      if (fail) return fail
    }
    return NextResponse.json(result)
  }

  // ── READ: runs live; completing reads mark the step done, the verification check only reports ──
  const result = await runStepAction(clientId, action)
  const completesStep = action.handler !== 'voiceOfMerchant'
  if (result.ok && completesStep) {
    const applied = { at: new Date().toISOString(), summary: result.summary ?? '', proofUrl: result.proofUrl ?? null, detail: result.detail ?? null }
    const fail = await saveStep(svc, id, campaignId, row.updated_at as string, steps, stepId, { applied }, true)
    if (fail) return fail
  }
  return NextResponse.json(result)
}
