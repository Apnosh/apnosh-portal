'use server'

/**
 * Scheduled-posts workflow helpers (Q1 1.4).
 *
 * Thin server actions that wrap the generic transition() helper, attach
 * actor context to the audit history row, and gate transitions by
 * client_services.requires_client_approval where relevant.
 *
 * Every state move on a scheduled post should go through one of these.
 * Direct UPDATEs still work (legacy paths) but lose actor attribution.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { transition } from '@/lib/workflow/transition'
import { logEvent } from '@/lib/events/log'

type ActorRole = 'admin' | 'strategist' | 'client' | 'system' | 'cron'

interface ActorContext {
  actorId?: string | null
  actorRole?: ActorRole
  reason?: string
}

interface PostRow {
  id: string
  client_id: string
  status: string
}

/** After the trigger fires, attach actor context to the latest history row. */
async function attachActor(postId: string, ctx: ActorContext): Promise<void> {
  if (!ctx.actorId && !ctx.actorRole && !ctx.reason) return
  const admin = createAdminClient()
  const { data: latest } = await admin
    .from('scheduled_posts_history')
    .select('id')
    .eq('scheduled_post_id', postId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!latest?.id) return
  await admin
    .from('scheduled_posts_history')
    .update({
      actor_id: ctx.actorId ?? null,
      actor_role: ctx.actorRole ?? null,
      reason: ctx.reason ?? null,
    })
    .eq('id', latest.id)
}

const STATE_TO_EVENT: Record<string, string> = {
  in_review: 'scheduled_post.submitted_for_review',
  approved: 'scheduled_post.approved',
  draft: 'scheduled_post.changes_requested',
  scheduled: 'scheduled_post.scheduled',
  published: 'scheduled_post.published',
  failed: 'scheduled_post.failed',
  canceled: 'scheduled_post.canceled',
}

async function move(
  postId: string,
  to: string,
  ctx: ActorContext,
  patch?: Record<string, unknown>
) {
  const result = await transition<PostRow>({
    table: 'scheduled_posts',
    id: postId,
    entityType: 'scheduled_post',
    to,
    actorId: ctx.actorId ?? null,
    patch,
  })
  if (result.ok) {
    await attachActor(postId, ctx)
    const eventType = STATE_TO_EVENT[to]
    if (eventType && result.row) {
      await logEvent({
        clientId: result.row.client_id,
        eventType,
        subjectType: 'scheduled_post',
        subjectId: postId,
        actorId: ctx.actorId ?? null,
        actorRole: ctx.actorRole,
        payload: { postId, fromState: null, toState: to, reason: ctx.reason },
      })
    }
  }
  return result
}

// ── Public workflow actions ──────────────────────────────────────

/** draft -> in_review */
export async function submitForReview(postId: string, ctx: ActorContext) {
  return move(postId, 'in_review', ctx)
}

/** in_review -> approved (or draft -> approved if trust mode) */
export async function approvePost(postId: string, ctx: ActorContext) {
  return move(postId, 'approved', { ...ctx, actorRole: ctx.actorRole ?? 'admin' })
}

/** in_review -> draft, with a reason the editor will see */
export async function requestChanges(
  postId: string,
  reason: string,
  ctx: ActorContext
) {
  return move(postId, 'draft', { ...ctx, reason })
}

/** approved -> scheduled */
export async function schedulePost(postId: string, ctx: ActorContext) {
  return move(postId, 'scheduled', ctx)
}

/** any non-terminal -> canceled */
export async function cancelPost(postId: string, ctx: ActorContext, reason?: string) {
  return move(postId, 'canceled', { ...ctx, reason: reason ?? ctx.reason })
}

/**
 * Approval gate: returns true when the client's services require explicit
 * client review before scheduling. Strategist UI uses this to decide
 * whether the "Submit for review" button shows up at all.
 */
export async function requiresClientApproval(clientId: string): Promise<boolean> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('client_services')
    .select('requires_client_approval')
    .eq('client_id', clientId)
    .eq('status', 'active')
  if (!data || data.length === 0) return true // safe default
  return data.some(r => r.requires_client_approval !== false)
}
