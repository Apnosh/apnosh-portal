import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { deliverGuard } from '@/lib/campaigns/data/service-playbooks'

/**
 * PATCH /api/admin/service-work-orders/:id — the operator control for ONE service work order.
 * An admin advances the order through its playbook: check steps off, move status, claim it, block it
 * on the client or an external gate, and deliver it with proof. Body (all optional, applied together):
 *   stepUpdates:  [{ id, status?, proofUrl? }]  — merged onto stored steps BY ID (the client can never
 *                                                 rewrite the authored step text, only its done state)
 *   status:       the new work-order status (validated against the allowed set)
 *   proofUrl:     the deliverable link (live profile, report, ...)
 *   proofNote:    the before/after summary handed to the client
 *   blockedReason: plain note shown while blocked
 *   claim:        true → assign this order to the calling admin
 *
 * HONESTY GUARANTEE, enforced here (not just the UI): status can only become 'delivered' when a
 * proof_url exists (in this PATCH or already on the row). A service cannot be "done" without proof.
 * Admin-only: the caller's role is checked before the service-role client writes.
 */
const VALID_STATUS = new Set(['queued', 'claimed', 'in_progress', 'blocked_client', 'blocked_gate', 'ready_for_client', 'delivered'])

async function requireAdmin(): Promise<{ userId: string } | NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'not authenticated' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  return { userId: user.id }
}

type StoredAction = { text: string; done: boolean; doneAt?: string }
type StoredStep = { id: string; status?: string; proofUrl?: string; doneAt?: string; actions?: StoredAction[]; [k: string]: unknown }

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const body = await req.json().catch(() => ({}))
  const svc = createAdminClient()

  // Load the current row so we merge onto (never blindly overwrite) its steps, and so we can honor
  // the honesty guarantee against proof that already exists.
  const { data: row, error: readErr } = await svc
    .from('service_work_orders')
    .select('campaign_id, client_id, service_id, title, steps, status, proof_url, started_at, updated_at')
    .eq('id', id)
    .maybeSingle()
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 })
  if (!row) return NextResponse.json({ error: 'work order not found' }, { status: 404 })

  // A delivered order is a closed record: its checklist can no longer be edited unless the same
  // request explicitly reopens the order (status back to a working state).
  const reopening = typeof body?.status === 'string' && body.status !== 'delivered'
  if (row.status === 'delivered' && Array.isArray(body?.stepUpdates) && !reopening) {
    return NextResponse.json({ error: 'This order is delivered. Reopen it before changing its checklist.' }, { status: 400 })
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  let mergedSteps: StoredStep[] = Array.isArray(row.steps) ? (row.steps as StoredStep[]) : []

  // Merge step updates by id. Only done-state + per-step proof change; authored text is immutable — the
  // client can toggle an action bullet's done-flag or the step status, never rewrite the task text.
  if (Array.isArray(body?.stepUpdates)) {
    const byId = new Map<string, { status?: string; proofUrl?: string; actionIndex?: number; actionDone?: boolean; markSent?: boolean }>()
    for (const u of body.stepUpdates) {
      if (u && typeof u.id === 'string') byId.set(u.id, { status: u.status, proofUrl: u.proofUrl, actionIndex: u.actionIndex, actionDone: u.actionDone, markSent: u.markSent === true })
    }
    const steps: StoredStep[] = mergedSteps
    const nowISO = new Date().toISOString()
    mergedSteps = steps.map((s) => {
      const u = byId.get(s.id)
      if (!u) return s
      const next: StoredStep = { ...s }
      // Toggle one authored action bullet (text stays fixed; only its done-flag moves).
      if (typeof u.actionIndex === 'number' && Array.isArray(next.actions) && next.actions[u.actionIndex]) {
        const done = u.actionDone !== false
        next.actions = next.actions.map((a, i) => (i === u.actionIndex ? { ...a, done, doneAt: done ? a.doneAt ?? nowISO : undefined } : a))
      }
      // Stamp a CLIENT-actor step as sent (the ask went out; now we wait on the owner).
      if (u.markSent && (next as { actor?: string }).actor === 'client') (next as Record<string, unknown>).sentAt = nowISO
      // Step status rules:
      //  - a GATED step (external gate like Google verification) is never done until the gate check
      //    confirmed it — bullets alone must not bypass the verification gate;
      //  - the DELIVER step never completes from its own bullets (only the explicit Deliver action),
      //    or checking its last checklist item would remove the Deliver button itself;
      //  - unchecking a bullet DEMOTES a done step back to todo (recompute, not promote-only), unless
      //    the step was completed by a verified push (its receipt outranks the checklist).
      const gated = !!(next as { gateKind?: string }).gateKind
      const gateCleared = ((next as { checked?: { kind?: string } }).checked?.kind === 'verified')
      const isDeliverStep = s.id === 'qa-deliver'
      const pushVerified = ((next as { applied?: { verified?: boolean } }).applied?.verified === true)
      const hasBullets = Array.isArray(next.actions) && next.actions.length > 0
      const bulletsAllDone = hasBullets && next.actions!.every((a) => a.done)
      if (u.status === 'todo') next.status = 'todo'
      else if (u.status === 'done') {
        next.status = gated && !gateCleared ? 'todo' : 'done'
        // An explicit done (e.g. the Deliver action) closes out its checklist too.
        if (next.status === 'done' && hasBullets) next.actions = next.actions!.map((a) => ({ ...a, done: true, doneAt: a.doneAt ?? nowISO }))
      } else if (hasBullets && !isDeliverStep) {
        next.status = bulletsAllDone && !(gated && !gateCleared) ? 'done' : (pushVerified ? next.status : 'todo')
      }
      next.doneAt = next.status === 'done' ? (s.doneAt as string | undefined) ?? nowISO : undefined
      if (typeof u.proofUrl === 'string') next.proofUrl = u.proofUrl || undefined
      return next
    })
    update.steps = mergedSteps
  }

  // Scalar deliverable fields.
  if (typeof body?.proofUrl === 'string') update.proof_url = body.proofUrl.trim() || null
  if (typeof body?.proofNote === 'string') update.proof_note = body.proofNote.trim() || null
  if (typeof body?.blockedReason === 'string') update.blocked_reason = body.blockedReason.trim() || null
  if (body?.claim === true) update.assignee_id = auth.userId

  // Status transition with the side effects each state implies.
  if (typeof body?.status === 'string') {
    if (!VALID_STATUS.has(body.status)) return NextResponse.json({ error: 'invalid status' }, { status: 400 })
    const nextStatus = body.status as string
    if (nextStatus === 'in_progress' && !row.started_at) update.started_at = new Date().toISOString()
    if (nextStatus === 'blocked_gate') update.gate_started_at = new Date().toISOString()
    if (nextStatus === 'delivered' && row.status !== 'delivered') update.delivered_at = new Date().toISOString()
    update.status = nextStatus
  }

  // HONESTY GUARANTEE, enforced on the FINAL row state (not just the transition, not just the UI):
  // delivered always carries proof AND — on the transition into delivered — every step is done, so an
  // order can never be handed over half-worked or without evidence. One pure guard (deliverGuard),
  // shared with its tests, generic over every authored playbook.
  const finalStatus = (update.status ?? row.status) as string
  const finalProof = ('proof_url' in update ? update.proof_url : row.proof_url) as string | null
  if (finalStatus === 'delivered') {
    const guard = deliverGuard(mergedSteps, finalProof, { checkSteps: row.status !== 'delivered' })
    if (!guard.ok) return NextResponse.json({ error: guard.reason }, { status: 400 })
  }

  // Optimistic concurrency: three writers (this PATCH, the apply route, the sync) all rewrite the
  // steps jsonb. Guarding on the updated_at we read means a racing write loses loudly (409, the
  // client refreshes and retries) instead of silently reverting someone else's work.
  const { data: writeRes, error } = await svc
    .from('service_work_orders')
    .update(update)
    .eq('id', id)
    .eq('updated_at', row.updated_at as string)
    .select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!writeRes || writeRes.length === 0) {
    return NextResponse.json({ error: 'This order changed while you were working. Refresh and try again.' }, { status: 409 })
  }

  // Tell the owner when their service is genuinely DONE (proof-backed delivered).
  // Service deliveries previously notified nobody — the same silent-stall class
  // the creator lane fixed. Best-effort, never blocks the write result.
  if (update.status === 'delivered' && row.status !== 'delivered' && row.client_id) {
    const { notifyClientOwners } = await import('@/lib/notifications')
    await notifyClientOwners(row.client_id as string, {
      kind: 'client_signoff',
      title: `${(row.title as string) || 'A service'} is done`,
      body: 'Your team finished it. The proof is on your campaign page.',
      link: row.campaign_id ? `/dashboard/campaigns/${row.campaign_id}` : '/dashboard/campaigns',
    }).catch(() => ({ notified: 0 }))

    // OWNERSHIP (sim crack #26): a delivered photo/video service lands in the owner's own
    // Photos & files library, not just a proof row on a feed. The deliverable link becomes
    // an asset they can open and download. Best-effort; never blocks the delivery.
    const PHOTO_SERVICES = new Set(['photo-library', 'menu-photo-refresh'])
    if (finalProof && PHOTO_SERVICES.has((row.service_id as string) ?? '')) {
      try {
        const isImage = /\.(jpe?g|png|webp|gif|heic)(\?|$)/i.test(finalProof)
        await svc.from('assets').insert({
          client_id: row.client_id,
          name: `${(row.title as string) || 'Your photos'} (delivered by your team)`,
          type: isImage ? 'image' : 'file',
          file_url: finalProof,
          tags: ['delivered', 'apnosh'],
          uploaded_by_client: false,
        })
      } catch { /* the proof still lives on the work order */ }
    }
  }

  if (row.campaign_id) revalidatePath(`/admin/campaign-orders/${row.campaign_id}`)
  return NextResponse.json({ ok: true })
}
