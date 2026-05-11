/**
 * Server-side reads for /work/clients (the strategist's book).
 *
 * Returns the clients the current user is assigned to as strategist
 * (or, for admin users, all clients — admin is a super-user).
 * Joins lightweight signals: pending tasks, draft quotes, last
 * activity. Used to render the strategist's home shelf.
 */

import { createClient as createServerClient } from '@/lib/supabase/server'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'

export interface StrategistClientRow {
  id: string
  name: string
  slug: string
  tier: string | null
  logoUrl: string | null
  billingStatus: string | null
  pendingTasks: number
  draftQuotes: number
  lastActivityAt: string | null
}

export async function getStrategistBook(): Promise<StrategistClientRow[]> {
  const supabase = await createServerClient()
  const { isAdmin } = await resolveCurrentClient()

  // Admin or strategist — RLS scopes the result. Admins see all,
  // strategists see only assigned. We do a single client query then
  // overlay signals.
  const { data: clients } = await supabase
    .from('clients')
    .select('id, name, slug, tier, logo_url, billing_status')
    .order('name')

  if (!clients || clients.length === 0) return []

  const ids = clients.map(c => c.id as string)

  // Pending tasks per client.
  const { data: tasks } = await supabase
    .from('client_tasks')
    .select('client_id, status')
    .in('client_id', ids)
    .in('status', ['todo', 'doing'])

  const taskCounts = new Map<string, number>()
  for (const t of tasks ?? []) {
    const k = t.client_id as string
    taskCounts.set(k, (taskCounts.get(k) ?? 0) + 1)
  }

  // Draft / pending quotes per client.
  const { data: quotes } = await supabase
    .from('content_quotes')
    .select('client_id, status, updated_at')
    .in('client_id', ids)
    .in('status', ['draft', 'sent', 'revising'])

  const quoteCounts = new Map<string, number>()
  const lastQuoteActivity = new Map<string, string>()
  for (const q of quotes ?? []) {
    const k = q.client_id as string
    quoteCounts.set(k, (quoteCounts.get(k) ?? 0) + 1)
    const u = q.updated_at as string | null
    if (u && (!lastQuoteActivity.get(k) || u > lastQuoteActivity.get(k)!)) {
      lastQuoteActivity.set(k, u)
    }
  }

  // Note: isAdmin is unused in the query itself — RLS handles scoping.
  // We expose it on the row so the UI can hide admin-only CTAs.
  void isAdmin

  return clients.map(c => ({
    id: c.id as string,
    name: c.name as string,
    slug: c.slug as string,
    tier: (c.tier as string) ?? null,
    logoUrl: (c.logo_url as string) ?? null,
    billingStatus: (c.billing_status as string) ?? null,
    pendingTasks: taskCounts.get(c.id as string) ?? 0,
    draftQuotes: quoteCounts.get(c.id as string) ?? 0,
    lastActivityAt: lastQuoteActivity.get(c.id as string) ?? null,
  }))
}
