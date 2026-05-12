/**
 * POST /api/work/drafts/[id]/lifecycle
 *
 * Drives a content_draft through the second half of its life cycle:
 *
 *   action='edit'      → update caption / media_brief / hashtags;
 *                         records a content_revisions row capturing
 *                         the diff (principle #8).
 *   action='schedule'  → status='scheduled', scheduled_for=date
 *                         (must be approved first).
 *   action='publish'   → status='published', published_at=now,
 *                         published_url=optional. published_post_id
 *                         attaches later when IG sync arrives.
 *   action='unschedule'→ status back to 'approved'
 *
 * Body shape:
 *   { action, caption?, mediaBrief?, hashtags?, scheduledFor?,
 *     publishedUrl?, publishedPostId?, note? }
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyClientOwners } from '@/lib/notifications'
import { attemptPublish } from '@/lib/publish/attempt-publish'
import { getApprovalSettings } from '@/lib/work/approval-settings'

export const dynamic = 'force-dynamic'

type Action = 'edit' | 'schedule' | 'unschedule' | 'publish'

interface Body {
  action?: Action
  caption?: string
  mediaBrief?: Record<string, unknown>
  hashtags?: string[]
  scheduledFor?: string         // ISO datetime
  publishedUrl?: string
  publishedPostId?: string
  publishedAt?: string
  note?: string
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id: draftId } = await ctx.params
  const body = (await req.json().catch(() => null)) as Body | null
  const action = body?.action
  if (!action) return NextResponse.json({ error: 'action required' }, { status: 400 })

  // RLS protects which drafts the caller can see; if hidden, 404.
  const { data: draft } = await supabase
    .from('content_drafts')
    .select('id, client_id, status, caption, media_brief, hashtags, scheduled_for, client_signed_off_at')
    .eq('id', draftId)
    .maybeSingle()
  if (!draft) return NextResponse.json({ error: 'draft not found' }, { status: 404 })

  const admin = createAdminClient()
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

  switch (action) {
    case 'edit': {
      // Capture before-state for the revisions table (principle #8).
      const priorCaption = (draft.caption as string) ?? null
      const priorBrief = (draft.media_brief as Record<string, unknown>) ?? {}

      if (typeof body?.caption === 'string') updates.caption = body.caption.slice(0, 4000)
      if (body?.mediaBrief !== undefined) updates.media_brief = body.mediaBrief
      if (Array.isArray(body?.hashtags)) updates.hashtags = body.hashtags.slice(0, 30)
      // Editing always moves a 'revising' draft back to 'draft' for
      // re-review. 'idea' stays as 'draft' once captioned.
      if (draft.status === 'revising' || draft.status === 'idea') {
        updates.status = 'draft'
      }

      // Write the revision row.
      await admin.from('content_revisions').insert({
        draft_id: draftId,
        revised_by: user.id,
        revised_via: 'human',
        prior_caption: priorCaption,
        new_caption: typeof body?.caption === 'string' ? body.caption.slice(0, 4000) : priorCaption,
        prior_brief: priorBrief,
        new_brief: body?.mediaBrief !== undefined ? body.mediaBrief : priorBrief,
        note: body?.note ?? null,
      })
      break
    }

    case 'schedule': {
      if (draft.status !== 'approved' && draft.status !== 'scheduled') {
        return NextResponse.json({ error: 'draft must be approved to schedule' }, { status: 400 })
      }
      if (!body?.scheduledFor) {
        return NextResponse.json({ error: 'scheduledFor required' }, { status: 400 })
      }
      updates.status = 'scheduled'
      updates.scheduled_for = body.scheduledFor
      break
    }

    case 'unschedule': {
      if (draft.status !== 'scheduled') {
        return NextResponse.json({ error: 'draft must be scheduled to unschedule' }, { status: 400 })
      }
      updates.status = 'approved'
      updates.scheduled_for = null
      break
    }

    case 'publish': {
      if (draft.status !== 'approved' && draft.status !== 'scheduled') {
        return NextResponse.json({ error: 'draft must be approved or scheduled to publish' }, { status: 400 })
      }

      // Per-client gate: some owners require their own sign-off before
      // anything goes live. allow_strategist_direct_publish lets a
      // trusted strategist bypass — useful for fast-moving accounts.
      const settings = await getApprovalSettings(draft.client_id as string)
      if (
        settings.client_signoff_required &&
        !draft.client_signed_off_at &&
        !settings.allow_strategist_direct_publish
      ) {
        return NextResponse.json({
          error: 'This client requires owner sign-off before publishing.',
          code: 'client_signoff_required',
        }, { status: 422 })
      }

      // Two paths:
      //   - body.publishedUrl present  → manual backfill (admin recording
      //     a post that went out via some other tool). Keep behavior.
      //   - otherwise                  → actually publish to the platforms
      //     via attemptPublish. If publishing fails we don't move status.
      if (body?.publishedUrl) {
        updates.status = 'published'
        updates.published_at = body?.publishedAt ?? new Date().toISOString()
        updates.published_url = body.publishedUrl
        if (body?.publishedPostId) updates.published_post_id = body.publishedPostId
      } else {
        const result = await attemptPublish(draftId)
        if (!result.ok) {
          return NextResponse.json({
            error: result.error ?? 'publish failed',
            code: result.errorCode,
            perPlatform: result.perPlatform,
          }, { status: 422 })
        }
        // attemptPublish already wrote published_at + published_url
        // directly to the draft. We just flip status here.
        updates.status = 'published'
        // Don't overwrite the receipt — attemptPublish set it.
        delete updates.updated_at  // re-set below by the standard path
        updates.updated_at = new Date().toISOString()
      }
      break
    }

    default:
      return NextResponse.json({ error: 'unknown action' }, { status: 400 })
  }

  const { data: updated, error } = await admin
    .from('content_drafts')
    .update(updates)
    .eq('id', draftId)
    .select('id, status, scheduled_for, published_at, published_url, published_post_id, caption, hashtags')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // If a client originally requested this content (via /work/inbox accept),
  // close the linked task once the draft ships. Best-effort — failures
  // here don't block the draft state change.
  if (action === 'publish' && updated?.status === 'published') {
    await admin
      .from('client_tasks')
      .update({
        status: 'done',
        completed_by: user.id,
        completed_at: new Date().toISOString(),
      })
      .eq('draft_id', draftId)
      .in('status', ['todo', 'doing'])

    await notifyClientOwners(draft.client_id as string, {
      kind: 'draft_published',
      title: 'Your post is live',
      body: body?.publishedUrl ? 'Open to see it in the wild.' : 'It just went out on your feed.',
      link: body?.publishedUrl ?? '/dashboard',
    }).catch(() => ({ notified: 0 }))
  }

  return NextResponse.json({ ok: true, draft: updated })
}
