/**
 * POST /api/work/drafts/[id]/judge
 *
 * Strategist or admin judgment on a draft. Captures the reason
 * (principle #3) and transitions draft status as a side-effect:
 *
 *   judgment='approved' → draft.status='approved', approved_by, approved_at
 *   judgment='revise'   → draft.status='revising', revision_count++
 *   judgment='rejected' → draft.status='rejected', rejection_reason
 *
 * Writes a row to human_judgments either way. The whole point of this
 * route is the judgment capture — the status transition is just the
 * UX consequence.
 *
 * Body:
 *   { judgment: 'approved'|'revise'|'rejected'|'escalate'|'flag_train',
 *     reasonTags?: string[],
 *     reasonNote?: string }
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyClientOwners } from '@/lib/notifications'
import { getApprovalSettings } from '@/lib/work/approval-settings'

export const dynamic = 'force-dynamic'

interface Body {
  judgment?: string
  reasonTags?: string[]
  reasonNote?: string
}

const VALID_JUDGMENTS = new Set(['approved','revise','rejected','escalate','flag_train'])

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id: draftId } = await ctx.params
  const body = (await req.json().catch(() => null)) as Body | null
  const judgment = body?.judgment
  if (!judgment || !VALID_JUDGMENTS.has(judgment)) {
    return NextResponse.json({ error: 'invalid judgment' }, { status: 400 })
  }

  const reasonTags = Array.isArray(body?.reasonTags) ? body.reasonTags : []
  const reasonNote = body?.reasonNote?.trim() ?? null

  // RLS protects which drafts this user can see; if RLS hides it we
  // get a not-found rather than an error.
  const { data: draft } = await supabase
    .from('content_drafts')
    .select('id, client_id, status, revision_count, media_urls')
    .eq('id', draftId)
    .maybeSingle()
  if (!draft) return NextResponse.json({ error: 'draft not found' }, { status: 404 })

  // Per-client preference: some owners want media attached before
  // anyone marks a draft 'approved'. We enforce that gate here so the
  // strategist gets a clear error rather than silently reaching the
  // publish step without visuals.
  if (judgment === 'approved') {
    const settings = await getApprovalSettings(draft.client_id as string)
    if (settings.media_required_before_approval) {
      const media = Array.isArray(draft.media_urls) ? (draft.media_urls as string[]).filter(Boolean) : []
      if (media.length === 0) {
        return NextResponse.json({
          error: 'This client requires media attached before approval.',
          code: 'media_required_before_approval',
        }, { status: 422 })
      }
    }
  }

  const admin = createAdminClient()

  // 1) Always record the judgment.
  await admin.from('human_judgments').insert({
    subject_type: 'content_draft',
    subject_id: draftId,
    judge_id: user.id,
    judgment,
    reason_tags: reasonTags,
    reason_note: reasonNote,
    context_snapshot: {
      prior_status: draft.status,
      revision_count: draft.revision_count,
      client_id: draft.client_id,
    },
  })

  // 2) Side-effect: transition the draft status accordingly.
  const updates: Record<string, unknown> = {}
  switch (judgment) {
    case 'approved':
      updates.status = 'approved'
      updates.approved_by = user.id
      updates.approved_at = new Date().toISOString()
      updates.rejection_reason = null
      break
    case 'revise':
      updates.status = 'revising'
      updates.revision_count = (draft.revision_count as number ?? 0) + 1
      break
    case 'rejected':
      updates.status = 'rejected'
      updates.rejection_reason = reasonNote ?? (reasonTags.join(', ') || 'rejected')
      break
    // escalate + flag_train don't change status; they're meta-judgments
  }

  if (Object.keys(updates).length > 0) {
    await admin
      .from('content_drafts')
      .update(updates)
      .eq('id', draftId)
  }

  // Tell the client when an internal approval lands so they know to
  // sign off. Other judgments stay internal.
  if (judgment === 'approved') {
    await notifyClientOwners(draft.client_id as string, {
      kind: 'draft_approved',
      title: 'A post is ready for your review',
      body: 'Your team approved the draft. Tap to read it and give the green light.',
      link: `/dashboard/preview/${draftId}`,
    }).catch(() => ({ notified: 0 }))
  }

  return NextResponse.json({ ok: true, judgment, newStatus: updates.status ?? draft.status })
}
