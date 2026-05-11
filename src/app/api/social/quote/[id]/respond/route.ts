/**
 * POST /api/social/quote/[id]/respond
 *
 * Client (or admin acting for client) responds to a quote.
 * Body: { action: 'approve' | 'decline' | 'revise', message?: string }
 *
 * Transitions:
 *   - sent / revising  →  approve  →  approved
 *   - sent / revising  →  decline  →  declined
 *   - sent             →  revise   →  revising
 * Anything else is a 409.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createQuoteInvoice } from '@/lib/admin/quote-invoice'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface Body {
  action: 'approve' | 'decline' | 'revise'
  message?: string | null
}

type RespondParams = { id: string }

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<RespondParams> },
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  let body: Body
  try {
    body = await req.json() as Body
  } catch {
    return new NextResponse('Invalid JSON', { status: 400 })
  }
  if (!['approve', 'decline', 'revise'].includes(body.action)) {
    return new NextResponse('Invalid action', { status: 400 })
  }
  if (body.action === 'revise' && (!body.message || body.message.trim().length < 5)) {
    return new NextResponse('Revise requires a message', { status: 400 })
  }

  const admin = createAdminClient()
  const { data: quote, error: readErr } = await admin
    .from('content_quotes')
    .select('id, client_id, status, total, title')
    .eq('id', id)
    .maybeSingle()
  if (readErr || !quote) {
    return new NextResponse('Quote not found', { status: 404 })
  }

  // Authorization: admin can act for any client; non-admin must own the quote's client.
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  const isAdmin = (profile?.role as string | null) === 'admin'
  if (!isAdmin) {
    const [{ data: biz }, { data: cu }] = await Promise.all([
      supabase.from('businesses').select('client_id').eq('owner_id', user.id).eq('client_id', quote.client_id).maybeSingle(),
      supabase.from('client_users').select('client_id').eq('auth_user_id', user.id).eq('client_id', quote.client_id).maybeSingle(),
    ])
    if (!biz && !cu) {
      return new NextResponse('Not authorized for this quote', { status: 403 })
    }
  }

  // State transition validation
  const status = quote.status as string
  if (body.action === 'approve' && !['sent', 'revising'].includes(status)) {
    return new NextResponse('Quote is not awaiting approval', { status: 409 })
  }
  if (body.action === 'decline' && !['sent', 'revising'].includes(status)) {
    return new NextResponse('Quote is not in a state that can be declined', { status: 409 })
  }
  if (body.action === 'revise' && status !== 'sent') {
    return new NextResponse('Can only request changes on a sent quote', { status: 409 })
  }

  const nextStatus =
    body.action === 'approve' ? 'approved' :
    body.action === 'decline' ? 'declined' :
                                'revising'

  const now = new Date().toISOString()
  const update: Record<string, unknown> = {
    status: nextStatus,
    client_message: body.message?.trim() || null,
  }
  if (body.action === 'approve' || body.action === 'decline') {
    update.responded_at = now
  }

  const { data: updated, error: updateErr } = await admin
    .from('content_quotes')
    .update(update)
    .eq('id', id)
    .select('*')
    .single()

  if (updateErr) {
    return new NextResponse(`Could not update: ${updateErr.message}`, { status: 500 })
  }

  // Event log
  await admin.from('events').insert({
    client_id: quote.client_id,
    event_type: `quote.${body.action}d`,
    subject_type: 'content_quote',
    subject_id: id,
    actor_id: user.id,
    actor_role: isAdmin ? 'admin' : 'client',
    summary: `${body.action.charAt(0).toUpperCase() + body.action.slice(1)}d quote: ${quote.title}`,
    payload: {
      total: quote.total,
      previous_status: status,
      message: body.message ?? null,
    },
  })

  // On approval, fire-and-await the Stripe invoice creation. Failure
  // here doesn't block the approval — the quote stays approved with
  // payment_status remaining at 'not_required', strategist can retry
  // by hitting the regenerate endpoint or invoicing manually.
  if (body.action === 'approve') {
    try {
      const inv = await createQuoteInvoice(id)
      // Refresh the row so the returned shape carries the invoice fields.
      if (inv) {
        const { data: refreshed } = await admin
          .from('content_quotes')
          .select('*')
          .eq('id', id)
          .single()
        if (refreshed) {
          Object.assign(updated, refreshed)
        }
      }
    } catch (e) {
      // Log to the events table so the strategist sees what happened.
      await admin.from('events').insert({
        client_id: quote.client_id,
        event_type: 'quote.invoice_failed_to_create',
        subject_type: 'content_quote',
        subject_id: id,
        actor_role: 'system',
        summary: `Could not create Stripe invoice: ${e instanceof Error ? e.message : 'unknown'}`,
        payload: {},
      })
    }
  }

  // Return the shaped quote so the UI can update in place.
  return NextResponse.json({
    ok: true,
    quote: {
      id: updated.id,
      clientId: updated.client_id,
      title: updated.title,
      sourceRequestSummary: updated.source_request_summary,
      lineItems: updated.line_items ?? [],
      subtotal: updated.subtotal != null ? Number(updated.subtotal) : null,
      discount: updated.discount != null ? Number(updated.discount) : 0,
      total: Number(updated.total ?? 0),
      estimatedTurnaroundDays: updated.estimated_turnaround_days,
      strategistMessage: updated.strategist_message,
      clientMessage: updated.client_message,
      status: updated.status,
      sentAt: updated.sent_at,
      respondedAt: updated.responded_at,
      expiresAt: updated.expires_at,
      createdAt: updated.created_at,
      paymentStatus: updated.payment_status ?? 'not_required',
      stripeInvoiceHostedUrl: updated.stripe_invoice_hosted_url ?? null,
      stripeInvoicePdfUrl: updated.stripe_invoice_pdf_url ?? null,
      paidAt: updated.paid_at ?? null,
    },
  })
}
