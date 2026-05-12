/**
 * POST /api/work/campaigns/[id]/redraft
 *
 * Re-runs AI on an existing draft using the stored brief. Updates
 * subject/preview/body in place and appends the new generation to
 * ai_generation_ids.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isCapable } from '@/lib/auth/require-any-capability'
import { generateEmail, type Brief } from '@/lib/work/generate-email'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  if (!(await isCapable(['email_specialist']))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { id } = await ctx.params

  const { data: existing } = await supabase
    .from('email_campaigns')
    .select('id, client_id, brief, status, ai_generation_ids')
    .eq('id', id)
    .maybeSingle()
  if (!existing) return NextResponse.json({ error: 'campaign not found' }, { status: 404 })
  if (!['draft', 'in_review', 'approved'].includes(existing.status as string)) {
    return NextResponse.json({ error: `cannot redraft from status ${existing.status}` }, { status: 409 })
  }

  const brief = (existing.brief as Brief | null)
  if (!brief?.theme) return NextResponse.json({ error: 'no brief on campaign' }, { status: 400 })

  const { email, parseError, generationId } = await generateEmail(existing.client_id as string, brief, user.id)
  if (parseError || !email) {
    return NextResponse.json({ error: 'AI failed', detail: parseError }, { status: 502 })
  }

  const admin = createAdminClient()
  const existingIds = (existing.ai_generation_ids as string[] | null) ?? []
  const nextIds = generationId ? [...existingIds, generationId] : existingIds

  const { error: updateErr } = await admin
    .from('email_campaigns')
    .update({
      subject: email.subject,
      preview_text: email.preview_text,
      body_text: email.body_text,
      ai_assisted: true,
      ai_generation_ids: nextIds,
    })
    .eq('id', id)
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    subject: email.subject,
    previewText: email.preview_text,
    bodyText: email.body_text,
    why: email.why,
    generationId,
  })
}
