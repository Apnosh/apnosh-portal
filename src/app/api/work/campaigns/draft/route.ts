/**
 * POST /api/work/campaigns/draft
 *
 * Creates a new email_campaigns row, calls AI to draft subject +
 * preview + body grounded in retrieval, and returns the row for
 * insertion into the drafts rail. Standard audit trail.
 *
 * Body: { clientId, name, brief: { theme, offer?, cta?, audience } }
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isCapable } from '@/lib/auth/require-any-capability'
import { generateEmail, type Brief } from '@/lib/work/generate-email'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

interface Body { clientId: string; name: string; brief: Brief }

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  if (!(await isCapable(['email_specialist']))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const body = (await req.json().catch(() => null)) as Body | null
  if (!body?.clientId || !body.name || !body.brief?.theme) {
    return NextResponse.json({ error: 'clientId, name, brief.theme required' }, { status: 400 })
  }

  const { email, parseError, generationId } = await generateEmail(body.clientId, body.brief, user.id)
  if (parseError || !email) {
    return NextResponse.json({ error: 'AI failed', detail: parseError }, { status: 502 })
  }

  const admin = createAdminClient()
  const { data: row, error: insertErr } = await admin
    .from('email_campaigns')
    .insert({
      client_id: body.clientId,
      name: body.name,
      subject: email.subject,
      preview_text: email.preview_text,
      body_text: email.body_text,
      brief: body.brief,
      status: 'draft',
      segment_name: body.brief.audience,
      ai_assisted: true,
      ai_generation_ids: generationId ? [generationId] : [],
      created_by: user.id,
    })
    .select('id, client_id, name, subject, preview_text, body_text, brief, status, scheduled_for, sent_at, recipient_count, segment_name, opens, clicks, unsubscribes, bounces, revenue, ai_assisted, created_at')
    .maybeSingle()

  if (insertErr || !row) {
    return NextResponse.json({ error: insertErr?.message ?? 'insert failed' }, { status: 500 })
  }

  // Get client name for the returned row
  const { data: client } = await supabase.from('clients').select('name, slug').eq('id', body.clientId).maybeSingle()

  return NextResponse.json({
    ok: true,
    row: {
      id: row.id, clientId: row.client_id, clientName: (client?.name as string) ?? null, clientSlug: (client?.slug as string) ?? null,
      name: row.name, subject: row.subject, previewText: row.preview_text, bodyText: row.body_text,
      brief: row.brief, status: row.status,
      scheduledFor: row.scheduled_for, sentAt: row.sent_at,
      recipientCount: row.recipient_count, segmentName: row.segment_name,
      opens: row.opens, clicks: row.clicks, unsubscribes: row.unsubscribes, bounces: row.bounces,
      revenue: row.revenue !== null ? Number(row.revenue) : null,
      aiAssisted: row.ai_assisted, createdAt: row.created_at,
    },
  })
}

