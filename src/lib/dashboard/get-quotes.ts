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
  return {
    id: r.id as string,
    clientId: r.client_id as string,
    title: (r.title as string) ?? 'Quote',
    sourceRequestSummary: (r.source_request_summary as string | null) ?? null,
    lineItems: ((r.line_items as QuoteLineItem[] | null) ?? []) as QuoteLineItem[],
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
  }
}
