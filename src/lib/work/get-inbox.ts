/**
 * Staff inbox: open client_tasks across the assigned book, scoped by
 * RLS. The most important rail is "client_request" — actual content
 * requests submitted by clients via /dashboard/social/request.
 * Secondary rails: internal action items (finance chases, etc).
 *
 * Each row carries enough context that the strategist can either
 *   - Accept (turn into a content_draft seeded with the request body)
 *   - Snooze (push out of the queue for now)
 *   - Dismiss (mark done without a draft, e.g. logistics-only request)
 */

import { createClient as createServerClient } from '@/lib/supabase/server'

export type TaskStatus = 'todo' | 'doing' | 'done' | 'canceled'
export type TaskSource = 'client_request' | 'system' | 'admin' | 'engage_followup' | 'invoice_chase'

export interface InboxRow {
  id: string
  clientId: string
  clientName: string | null
  clientSlug: string | null
  title: string
  body: string | null
  status: TaskStatus
  source: TaskSource | null
  visibleToClient: boolean
  draftId: string | null  // set once converted to a content_draft
  aiAnalysis: Record<string, unknown> | null
  createdAt: string
  dueAt: string | null
  snoozedUntil: string | null
}

export interface InboxBuckets {
  clientRequests: InboxRow[]   // source='client_request', status='todo'
  internal: InboxRow[]         // other open tasks
  recent: InboxRow[]           // recently closed (last 7d)
}

interface RawTask {
  id: string
  client_id: string
  title: string
  body: string | null
  status: TaskStatus
  source: string | null
  visible_to_client: boolean
  draft_id: string | null
  ai_analysis: Record<string, unknown> | null
  created_at: string
  due_at: string | null
  snoozed_until: string | null
}

const SELECT = 'id, client_id, title, body, status, source, visible_to_client, draft_id, ai_analysis, created_at, due_at, snoozed_until'

export async function getInbox(): Promise<InboxBuckets> {
  const supabase = await createServerClient()
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [openRes, recentRes] = await Promise.all([
    supabase
      .from('client_tasks')
      .select(SELECT)
      .in('status', ['todo', 'doing'])
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('client_tasks')
      .select(SELECT)
      .in('status', ['done', 'canceled'])
      .gte('updated_at', sevenDaysAgo)
      .order('updated_at', { ascending: false })
      .limit(20),
  ])

  const all = [
    ...((openRes.data ?? []) as RawTask[]),
    ...((recentRes.data ?? []) as RawTask[]),
  ]
  const clientIds = Array.from(new Set(all.map(r => r.client_id)))
  const clientMap = new Map<string, { name: string | null; slug: string | null }>()
  if (clientIds.length > 0) {
    const { data: clients } = await supabase.from('clients').select('id, name, slug').in('id', clientIds)
    for (const c of clients ?? []) {
      clientMap.set(c.id as string, { name: (c.name as string) ?? null, slug: (c.slug as string) ?? null })
    }
  }

  const toRow = (r: RawTask): InboxRow => {
    const c = clientMap.get(r.client_id) ?? { name: null, slug: null }
    return {
      id: r.id,
      clientId: r.client_id,
      clientName: c.name,
      clientSlug: c.slug,
      title: r.title,
      body: r.body,
      status: r.status,
      source: (r.source as TaskSource | null) ?? null,
      visibleToClient: r.visible_to_client,
      draftId: r.draft_id,
      aiAnalysis: r.ai_analysis,
      createdAt: r.created_at,
      dueAt: r.due_at,
      snoozedUntil: r.snoozed_until,
    }
  }

  const openRows = ((openRes.data ?? []) as RawTask[]).map(toRow)
  const recentRows = ((recentRes.data ?? []) as RawTask[]).map(toRow)

  return {
    clientRequests: openRows.filter(r => r.source === 'client_request'),
    internal: openRows.filter(r => r.source !== 'client_request'),
    recent: recentRows,
  }
}
