/**
 * Cross-client quotes view for a strategist. Pulls every quote that
 * touches a client in their assigned book (RLS handles the scope —
 * see migration 104).
 */

import { createClient as createServerClient } from '@/lib/supabase/server'

export interface StrategistQuoteRow {
  id: string
  clientId: string
  clientName: string | null
  clientSlug: string | null
  title: string
  status: string
  total: number
  sentAt: string | null
  respondedAt: string | null
  createdAt: string
}

export async function getStrategistQuotes(): Promise<StrategistQuoteRow[]> {
  const supabase = await createServerClient()

  const { data: quotes, error } = await supabase
    .from('content_quotes')
    .select('id, client_id, title, status, total, sent_at, responded_at, created_at')
    .order('created_at', { ascending: false })
    .limit(200)
  if (error || !quotes || quotes.length === 0) return []

  const clientIds = Array.from(new Set(quotes.map(q => q.client_id as string)))
  const { data: clients } = await supabase
    .from('clients')
    .select('id, name, slug')
    .in('id', clientIds)
  const byId = new Map((clients ?? []).map(c => [c.id as string, c]))

  return quotes.map(q => {
    const c = byId.get(q.client_id as string)
    return {
      id: q.id as string,
      clientId: q.client_id as string,
      clientName: (c?.name as string) ?? null,
      clientSlug: (c?.slug as string) ?? null,
      title: (q.title as string) ?? 'Untitled quote',
      status: (q.status as string) ?? 'draft',
      total: Number(q.total ?? 0),
      sentAt: (q.sent_at as string) ?? null,
      respondedAt: (q.responded_at as string) ?? null,
      createdAt: (q.created_at as string) ?? new Date().toISOString(),
    }
  })
}
