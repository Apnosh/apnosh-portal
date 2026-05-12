/**
 * POST /api/work/engage/[id]/reply
 *
 * Records a reply to a social_interactions row. Stamps reply_text +
 * reply_at, flips status to 'replied', optionally links the AI
 * generation that drafted it for audit.
 *
 * Also handles dismiss / spam (status → 'dismissed' | 'spam').
 *
 * NOTE: This records the reply in our system. The actual platform
 * send (Meta API call) happens via /api/social/inbox in the existing
 * client-facing flow. Once we wire the unified send path through
 * here we'll call that internally from this handler.
 *
 * Body:
 *   reply mode: { replyText: string, aiAssisted?: boolean, generationId?: string }
 *   dismiss mode: { dismiss: true, spam?: boolean }
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isCapable } from '@/lib/auth/require-any-capability'

export const dynamic = 'force-dynamic'

interface Body {
  replyText?: string
  aiAssisted?: boolean
  generationId?: string
  dismiss?: boolean
  spam?: boolean
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  if (!(await isCapable(['community_mgr']))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { id } = await ctx.params
  const body = (await req.json().catch(() => null)) as Body | null
  if (!body) return NextResponse.json({ error: 'body required' }, { status: 400 })

  const { data: existing } = await supabase
    .from('social_interactions')
    .select('id, client_id, status, ai_generation_ids')
    .eq('id', id)
    .maybeSingle()
  if (!existing) return NextResponse.json({ error: 'interaction not found' }, { status: 404 })
  if (existing.status !== 'open') {
    return NextResponse.json({ error: `cannot act on status ${existing.status}` }, { status: 409 })
  }

  const admin = createAdminClient()

  // Dismiss / spam path
  if (body.dismiss) {
    const newStatus = body.spam ? 'spam' : 'dismissed'
    const { error } = await admin
      .from('social_interactions')
      .update({ status: newStatus })
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await admin.from('events').insert({
      client_id: existing.client_id,
      event_type: `engage.${newStatus}`,
      subject_type: 'social_interaction',
      subject_id: id,
      actor_id: user.id,
      actor_role: 'staff',
      summary: `Interaction ${newStatus}`,
    })
    return NextResponse.json({ ok: true, status: newStatus })
  }

  // Reply path
  const replyText = (body.replyText ?? '').trim()
  if (!replyText) {
    return NextResponse.json({ error: 'replyText required' }, { status: 400 })
  }

  const existingGenIds = (existing.ai_generation_ids as string[] | null) ?? []
  const nextGenIds = body.generationId && !existingGenIds.includes(body.generationId)
    ? [...existingGenIds, body.generationId]
    : existingGenIds

  const { error: updateErr } = await admin
    .from('social_interactions')
    .update({
      status: 'replied',
      reply_text: replyText,
      reply_at: new Date().toISOString(),
      replied_by: user.id,
      ai_assisted: body.aiAssisted ?? false,
      ai_generation_ids: nextGenIds,
    })
    .eq('id', id)
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  await admin.from('events').insert({
    client_id: existing.client_id,
    event_type: 'engage.replied',
    subject_type: 'social_interaction',
    subject_id: id,
    actor_id: user.id,
    actor_role: 'staff',
    summary: body.aiAssisted ? 'Reply sent (AI-assisted)' : 'Reply sent (human)',
    payload: { reply_chars: replyText.length },
  })

  return NextResponse.json({ ok: true, status: 'replied' })
}
