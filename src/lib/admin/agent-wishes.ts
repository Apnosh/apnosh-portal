'use server'

/**
 * Strategist surface for the "what did you wish I could do?" inbox.
 * Aggregates by similar wish_text so the team can spot patterns:
 * "8 owners asked for scheduled GBP posts; that's the next tool to
 * build."
 */

import { revalidatePath } from 'next/cache'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function requireAdmin(): Promise<{ userId: string } | { error: string }> {
  const userSupabase = await createServerClient()
  const { data: { user } } = await userSupabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'admin') return { error: 'Admin required' }
  return { userId: user.id }
}

export interface WishRow {
  id: string
  clientId: string
  clientName: string
  isBeta: boolean
  conversationId: string | null
  triggerKind: string
  wishText: string
  status: string
  category: string | null
  createdAt: string
  reviewedAt: string | null
}

export async function listWishes(opts: { status?: string; limit?: number } = {}): Promise<WishRow[]> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return []
  const admin = createAdminClient()

  let query = admin
    .from('agent_unmet_intents')
    .select('id, client_id, conversation_id, trigger_kind, wish_text, status, category, created_at, reviewed_at, clients(name, is_beta)')
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 100)
  if (opts.status && opts.status !== 'all') {
    query = query.eq('status', opts.status)
  }
  const { data } = await query
  return ((data ?? []) as Array<{
    id: string; client_id: string; conversation_id: string | null; trigger_kind: string;
    wish_text: string; status: string; category: string | null;
    created_at: string; reviewed_at: string | null;
    clients: { name: string; is_beta?: boolean | null } | Array<{ name: string; is_beta?: boolean | null }> | null;
  }>).map(r => {
    const c = Array.isArray(r.clients) ? r.clients[0] : r.clients
    return {
      id: r.id,
      clientId: r.client_id,
      clientName: c?.name ?? '—',
      isBeta: !!c?.is_beta,
      conversationId: r.conversation_id,
      triggerKind: r.trigger_kind,
      wishText: r.wish_text,
      status: r.status,
      category: r.category,
      createdAt: r.created_at,
      reviewedAt: r.reviewed_at,
    }
  })
}

export async function updateWishStatus(args: {
  id: string
  status: 'new' | 'reviewed' | 'in_roadmap' | 'duplicate' | 'wont_build'
  category?: string
  notes?: string
}): Promise<{ success: true } | { success: false; error: string }> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { success: false, error: ctx.error }
  const admin = createAdminClient()
  const update: Record<string, unknown> = {
    status: args.status,
    reviewed_at: new Date().toISOString(),
    reviewed_by: ctx.userId,
  }
  if (args.category != null) update.category = args.category
  if (args.notes != null) update.notes = args.notes
  const { error } = await admin.from('agent_unmet_intents').update(update).eq('id', args.id)
  if (error) return { success: false, error: error.message }
  revalidatePath('/admin/agent-wishes')
  return { success: true }
}
