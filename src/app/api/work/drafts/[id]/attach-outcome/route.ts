/**
 * POST /api/work/drafts/[id]/attach-outcome
 *
 * Closes the compounding loop: a published draft gets its real
 * platform outcome attached. Creates a social_posts row linked
 * back to the draft via source_draft_id + source_theme_id, copies
 * provenance (proposed_by, proposed_via, ai_generation_ids,
 * brand_voice_version), and also stamps content_drafts.outcome_summary
 * so the drafts view renders the snapshot inline.
 *
 * After this fires, the next getClientContext() call sees this post
 * in topPostsByEngagement — AI helpers downstream automatically
 * benefit from the new signal.
 *
 * Body:
 *   { platform?: 'instagram'|'facebook'|'tiktok',
 *     externalId: string,
 *     permalink?: string, mediaUrl?: string,
 *     reach: number, likes: number, comments: number,
 *     saves?: number, shares?: number, videoViews?: number,
 *     postedAt?: string }
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isCapable } from '@/lib/auth/require-any-capability'

export const dynamic = 'force-dynamic'

interface Body {
  platform?: 'instagram' | 'facebook' | 'tiktok'
  externalId: string
  permalink?: string
  mediaUrl?: string
  reach: number
  likes: number
  comments: number
  saves?: number
  shares?: number
  videoViews?: number
  postedAt?: string
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Strategist or anyone who owns the draft lifecycle can attach outcomes;
  // also allow paid_media (they look at outcomes for boost decisions).
  if (!(await isCapable(['strategist', 'paid_media', 'data_analyst']))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { id } = await ctx.params
  const body = (await req.json().catch(() => null)) as Body | null
  if (!body?.externalId || typeof body.reach !== 'number') {
    return NextResponse.json({ error: 'externalId + reach required' }, { status: 400 })
  }

  const { data: draft } = await supabase
    .from('content_drafts')
    .select('id, client_id, status, source_theme_id, proposed_by, proposed_via, ai_generation_ids, caption, published_post_id')
    .eq('id', id)
    .maybeSingle()
  if (!draft) return NextResponse.json({ error: 'draft not found' }, { status: 404 })
  if (draft.status !== 'published') {
    return NextResponse.json({ error: `draft is ${draft.status}, must be published to attach outcome` }, { status: 409 })
  }

  const admin = createAdminClient()
  const platform = body.platform ?? 'instagram'
  const interactions = (body.likes ?? 0) + (body.comments ?? 0) + (body.saves ?? 0) + (body.shares ?? 0)
  const postedAt = body.postedAt ?? new Date().toISOString()

  // Read the current brand version to stamp this outcome with the voice
  // that produced it (so future retrieval can correlate voice→outcome).
  const { data: brand } = await supabase
    .from('client_brands')
    .select('version')
    .eq('client_id', draft.client_id as string)
    .maybeSingle()
  const brandVoiceVersion = Number(brand?.version ?? 1)

  // Upsert: external_id+platform+client are unique, so attaching twice
  // (with updated metrics) just refreshes the numbers.
  const { data: post, error: upsertErr } = await admin
    .from('social_posts')
    .upsert(
      {
        client_id: draft.client_id,
        platform,
        external_id: body.externalId,
        media_type: body.videoViews ? 'VIDEO' : 'IMAGE',
        caption: draft.caption,
        permalink: body.permalink ?? null,
        media_url: body.mediaUrl ?? null,
        posted_at: postedAt,
        reach: body.reach,
        likes: body.likes,
        comments: body.comments,
        saves: body.saves ?? 0,
        shares: body.shares ?? 0,
        video_views: body.videoViews ?? 0,
        total_interactions: interactions,
        synced_at: new Date().toISOString(),
        source_theme_id: draft.source_theme_id,
        source_draft_id: draft.id,
        proposed_by: draft.proposed_by,
        proposed_via: draft.proposed_via,
        ai_generation_ids: draft.ai_generation_ids ?? [],
        brand_voice_version: brandVoiceVersion,
        outcome_summary: {
          captured_at: new Date().toISOString(),
          engagement_rate: body.reach > 0 ? interactions / body.reach : null,
          attached_by: user.id,
        },
      },
      { onConflict: 'client_id,platform,external_id' }
    )
    .select('id, total_interactions, reach')
    .maybeSingle()
  if (upsertErr || !post) {
    return NextResponse.json({ error: upsertErr?.message ?? 'upsert failed' }, { status: 500 })
  }

  // Also stamp the draft so the drafts view can show the outcome inline
  // without a join.
  await admin
    .from('content_drafts')
    .update({
      published_post_id: post.id,
      outcome_summary: {
        platform,
        external_id: body.externalId,
        reach: body.reach,
        interactions,
        engagement_rate: body.reach > 0 ? interactions / body.reach : null,
        attached_at: new Date().toISOString(),
      },
    })
    .eq('id', id)

  await admin.from('events').insert({
    client_id: draft.client_id,
    event_type: 'draft.outcome_attached',
    subject_type: 'content_draft',
    subject_id: id,
    actor_id: user.id,
    actor_role: 'staff',
    summary: `Outcome attached: ${body.reach} reach / ${interactions} interactions`,
    payload: {
      social_post_id: post.id,
      reach: body.reach,
      interactions,
    },
  })

  return NextResponse.json({
    ok: true,
    socialPostId: post.id,
    reach: body.reach,
    interactions,
    engagementRate: body.reach > 0 ? interactions / body.reach : null,
  })
}
