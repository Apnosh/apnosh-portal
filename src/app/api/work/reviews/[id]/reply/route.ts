/**
 * POST /api/work/reviews/[id]/reply
 *
 * Records a review response (and optionally would also post to GBP
 * via the Business Profile API once we wire that in). Stamps
 * reply_text + reply_at, flips status to 'replied'.
 *
 * Also handles dismissal (e.g. obvious spam or test reviews).
 *
 * Body:
 *   { replyText, aiAssisted?, generationId? }
 *   { dismiss: true }
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
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  if (!(await isCapable(['local_seo']))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { id } = await ctx.params
  const body = (await req.json().catch(() => null)) as Body | null
  if (!body) return NextResponse.json({ error: 'body required' }, { status: 400 })

  const { data: existing } = await supabase
    .from('local_reviews')
    .select('id, client_id, status, ai_generation_ids')
    .eq('id', id)
    .maybeSingle()
  if (!existing) return NextResponse.json({ error: 'review not found' }, { status: 404 })
  if (existing.status !== 'open') {
    return NextResponse.json({ error: `cannot act on status ${existing.status}` }, { status: 409 })
  }

  const admin = createAdminClient()

  if (body.dismiss) {
    const { error } = await admin.from('local_reviews').update({ status: 'dismissed' }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await admin.from('events').insert({
      client_id: existing.client_id,
      event_type: 'review.dismissed',
      subject_type: 'local_review',
      subject_id: id,
      actor_id: user.id,
      actor_role: 'staff',
      summary: 'Review dismissed',
    })
    return NextResponse.json({ ok: true, status: 'dismissed' })
  }

  const replyText = (body.replyText ?? '').trim()
  if (!replyText) return NextResponse.json({ error: 'replyText required' }, { status: 400 })

  const existingGenIds = (existing.ai_generation_ids as string[] | null) ?? []
  const nextGenIds = body.generationId && !existingGenIds.includes(body.generationId)
    ? [...existingGenIds, body.generationId]
    : existingGenIds

  const { error: updateErr } = await admin
    .from('local_reviews')
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
    event_type: 'review.replied',
    subject_type: 'local_review',
    subject_id: id,
    actor_id: user.id,
    actor_role: 'staff',
    summary: body.aiAssisted ? 'Review reply sent (AI-assisted)' : 'Review reply sent (human)',
    payload: { reply_chars: replyText.length },
  })

  return NextResponse.json({ ok: true, status: 'replied' })
}
