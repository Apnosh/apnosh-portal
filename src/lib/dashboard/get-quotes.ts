'use server'

/**
 * Reads of content_quotes for the client-facing surfaces.
 *
 * - getPendingQuotes: 'sent' or 'revising' status — these are the
 *   quotes the client needs to act on. Drives the hub card.
 * - getQuote: single quote with full line-item detail. Drives
 *   /dashboard/social/quotes/[id].
 */

import { createAdminClient } from '@/lib/supabase/admin'

export type QuoteStatus =
  | 'draft' | 'sent' | 'approved' | 'declined' | 'revising' | 'expired'

export interface QuoteLineItem {
  label: string
  qty: number
  unit_price: number
  total: number
  notes?: string
}

export type QuotePaymentStatus =
  | 'not_required' | 'pending' | 'paid' | 'failed' | 'refunded' | 'voided'

export interface ContentQuote {
  id: string
  clientId: string
  title: string
  sourceRequestSummary: string | null
  lineItems: QuoteLineItem[]
  subtotal: number | null
  discount: number
  total: number
  estimatedTurnaroundDays: number | null
  strategistMessage: string | null
  clientMessage: string | null
  status: QuoteStatus
  sentAt: string | null
  respondedAt: string | null
  expiresAt: string | null
  createdAt: string
  paymentStatus: QuotePaymentStatus
  stripeInvoiceHostedUrl: string | null
  stripeInvoicePdfUrl: string | null
  amountDueCents: number | null
  paidAt: string | null
  paymentFailedAt: string | null
  paymentFailureReason: string | null
}

const PENDING_STATUSES: QuoteStatus[] = ['sent', 'revising']

export async function getPendingQuotes(clientId: string): Promise<ContentQuote[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('content_quotes')
    .select('*')
    .eq('client_id', clientId)
    .in('status', PENDING_STATUSES)
    .order('sent_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(10)
  return (data ?? []).map(toQuote)
}

export async function getRecentQuotes(clientId: string, limit = 8): Promise<ContentQuote[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('content_quotes')
    .select('*')
    .eq('client_id', clientId)
    .neq('status', 'draft')
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data ?? []).map(toQuote)
}

export async function getQuote(quoteId: string, clientId: string): Promise<ContentQuote | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('content_quotes')
    .select('*')
    .eq('id', quoteId)
    .eq('client_id', clientId)
    .neq('status', 'draft')
    .maybeSingle()
  return data ? toQuote(data) : null
}

function toQuote(r: Record<string, unknown>): ContentQuote {
  // Line items may have landed in DB with either camelCase (unitPrice, from
  // raw AI output) or snake_case (unit_price, from the strategist quote
  // builder). Normalize to unit_price on read so the renderer always works.
  type RawItem = Partial<QuoteLineItem & { unitPrice: number; unit_price: number }>
  const rawItems = (r.line_items as RawItem[] | null) ?? []
  const lineItems: QuoteLineItem[] = rawItems.map(it => ({
    label: String(it.label ?? ''),
    qty: Number(it.qty ?? 0),
    unit_price: Number(it.unit_price ?? it.unitPrice ?? 0),
    total: Number(it.total ?? 0),
    ...(it.notes ? { notes: String(it.notes) } : {}),
  }))

  return {
    id: r.id as string,
    clientId: r.client_id as string,
    title: (r.title as string) ?? 'Quote',
    sourceRequestSummary: (r.source_request_summary as string | null) ?? null,
    lineItems,
    subtotal: r.subtotal != null ? Number(r.subtotal) : null,
    discount: r.discount != null ? Number(r.discount) : 0,
    total: Number(r.total ?? 0),
    estimatedTurnaroundDays: (r.estimated_turnaround_days as number | null) ?? null,
    strategistMessage: (r.strategist_message as string | null) ?? null,
    clientMessage: (r.client_message as string | null) ?? null,
    status: r.status as QuoteStatus,
    sentAt: (r.sent_at as string | null) ?? null,
    respondedAt: (r.responded_at as string | null) ?? null,
    expiresAt: (r.expires_at as string | null) ?? null,
    createdAt: r.created_at as string,
    paymentStatus: (r.payment_status as QuotePaymentStatus | null) ?? 'not_required',
    stripeInvoiceHostedUrl: (r.stripe_invoice_hosted_url as string | null) ?? null,
    stripeInvoicePdfUrl: (r.stripe_invoice_pdf_url as string | null) ?? null,
    amountDueCents: (r.amount_due_cents as number | null) ?? null,
    paidAt: (r.paid_at as string | null) ?? null,
    paymentFailedAt: (r.payment_failed_at as string | null) ?? null,
    paymentFailureReason: (r.payment_failure_reason as string | null) ?? null,
  }
}
