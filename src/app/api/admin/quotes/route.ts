/**
 * POST /api/admin/quotes — strategist creates a quote.
 *
 * Body: { clientId, title, lineItems[], subtotal, discount, total,
 *         estimatedTurnaroundDays, strategistMessage,
 *         sourceRequestId, sourceRequestSummary, status }
 *
 * status defaults to 'sent'. If 'sent', sets sent_at = now() so the
 * client sees it on the hub immediately.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface LineItem {
  label: string
  qty: number
  unit_price: number
  total: number
  notes?: string
}

interface Body {
  clientId: string
  title: string
  lineItems: LineItem[]
  subtotal: number
  discount?: number
  total: number
  estimatedTurnaroundDays?: number | null
  strategistMessage?: string | null
  sourceRequestId?: string | null
  sourceRequestSummary?: string | null
  status?: 'draft' | 'sent'
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  if ((profile?.role as string | null) !== 'admin') {
    return new NextResponse('Admin only', { status: 403 })
  }

  let body: Body
  try {
    body = await req.json() as Body
  } catch {
    return new NextResponse('Invalid JSON', { status: 400 })
  }

  if (!body.clientId || !body.title || body.title.trim().length < 2) {
    return new NextResponse('clientId and title required', { status: 400 })
  }
  if (!Array.isArray(body.lineItems) || body.lineItems.length === 0) {
    return new NextResponse('At least one line item required', { status: 400 })
  }
  if (!Number.isFinite(body.total) || body.total <= 0) {
    return new NextResponse('Total must be > 0', { status: 400 })
  }

  const status = body.status === 'draft' ? 'draft' : 'sent'
  const now = new Date().toISOString()

  const admin = createAdminClient()
  const { data: inserted, error } = await admin
    .from('content_quotes')
    .insert({
      client_id: body.clientId,
      source_request_id: body.sourceRequestId ?? null,
      source_request_summary: body.sourceRequestSummary ?? null,
      title: body.title.trim(),
      line_items: body.lineItems,
      subtotal: body.subtotal,
      discount: body.discount ?? 0,
      total: body.total,
      estimated_turnaround_days: body.estimatedTurnaroundDays ?? null,
      strategist_message: body.strategistMessage ?? null,
      status,
      sent_at: status === 'sent' ? now : null,
      created_by: user.id,
    })
    .select('id')
    .single()

  if (error) {
    return new NextResponse(`Could not save: ${error.message}`, { status: 500 })
  }

  // Mark the source request as 'doing' so it leaves the strategist's queue.
  if (body.sourceRequestId) {
    await admin
      .from('client_tasks')
      .update({ status: 'doing' })
      .eq('id', body.sourceRequestId)
  }

  await admin.from('events').insert({
    client_id: body.clientId,
    event_type: status === 'sent' ? 'quote.sent' : 'quote.drafted',
    subject_type: 'content_quote',
    subject_id: inserted?.id ?? null,
    actor_id: user.id,
    actor_role: 'admin',
    summary: `${status === 'sent' ? 'Sent' : 'Drafted'} quote: ${body.title.trim()} — $${body.total.toFixed(0)}`,
    payload: {
      total: body.total,
      item_count: body.lineItems.length,
      source_request_id: body.sourceRequestId ?? null,
    },
  })

  return NextResponse.json({ id: inserted?.id ?? null })
}
