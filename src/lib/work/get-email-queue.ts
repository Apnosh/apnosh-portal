/**
 * Email specialist's queue across the assigned book: drafts (still
 * being written), scheduled (locked in, waiting to go), sent
 * (history with metrics).
 */

import { createClient as createServerClient } from '@/lib/supabase/server'

export type EmailStatus =
  | 'draft' | 'in_review' | 'approved' | 'scheduled' | 'sending' | 'sent' | 'cancelled'

export interface EmailRow {
  id: string
  clientId: string
  clientName: string | null
  clientSlug: string | null
  name: string
  subject: string
  previewText: string | null
  bodyText: string | null
  brief: Record<string, unknown>
  status: EmailStatus
  scheduledFor: string | null
  sentAt: string | null
  recipientCount: number
  segmentName: string | null
  opens: number
  clicks: number
  unsubscribes: number
  bounces: number
  revenue: number | null
  aiAssisted: boolean
  createdAt: string
}

interface RawEmail {
  id: string
  client_id: string
  name: string
  subject: string
  preview_text: string | null
  body_text: string | null
  brief: Record<string, unknown> | null
  status: EmailStatus
  scheduled_for: string | null
  sent_at: string | null
  recipient_count: number | null
  segment_name: string | null
  opens: number | null
  clicks: number | null
  unsubscribes: number | null
  bounces: number | null
  revenue: number | null
  ai_assisted: boolean | null
  created_at: string
}

export interface EmailBuckets {
  drafts: EmailRow[]
  scheduled: EmailRow[]
  sent: EmailRow[]
}

const SELECT =
  'id, client_id, name, subject, preview_text, body_text, brief, status, scheduled_for, sent_at, recipient_count, segment_name, opens, clicks, unsubscribes, bounces, revenue, ai_assisted, created_at'

const DRAFTS: EmailStatus[] = ['draft', 'in_review', 'approved']
const SCHEDULED: EmailStatus[] = ['scheduled', 'sending']

export async function getEmailQueue(): Promise<EmailBuckets> {
  const supabase = await createServerClient()

  const [draftRes, schedRes, sentRes] = await Promise.all([
    supabase.from('email_campaigns').select(SELECT).in('status', DRAFTS).order('created_at', { ascending: false }).limit(50),
    supabase.from('email_campaigns').select(SELECT).in('status', SCHEDULED).order('scheduled_for', { ascending: true, nullsFirst: false }).limit(50),
    supabase.from('email_campaigns').select(SELECT).eq('status', 'sent').order('sent_at', { ascending: false }).limit(30),
  ])

  const all = [
    ...((draftRes.data ?? []) as RawEmail[]),
    ...((schedRes.data ?? []) as RawEmail[]),
    ...((sentRes.data ?? []) as RawEmail[]),
  ]
  const clientIds = Array.from(new Set(all.map(r => r.client_id)))
  const clientMap = new Map<string, { name: string | null; slug: string | null }>()
  if (clientIds.length > 0) {
    const { data: clients } = await supabase.from('clients').select('id, name, slug').in('id', clientIds)
    for (const c of clients ?? []) {
      clientMap.set(c.id as string, { name: (c.name as string) ?? null, slug: (c.slug as string) ?? null })
    }
  }

  const toRow = (r: RawEmail): EmailRow => {
    const c = clientMap.get(r.client_id) ?? { name: null, slug: null }
    return {
      id: r.id,
      clientId: r.client_id,
      clientName: c.name,
      clientSlug: c.slug,
      name: r.name,
      subject: r.subject,
      previewText: r.preview_text,
      bodyText: r.body_text,
      brief: r.brief ?? {},
      status: r.status,
      scheduledFor: r.scheduled_for,
      sentAt: r.sent_at,
      recipientCount: Number(r.recipient_count ?? 0),
      segmentName: r.segment_name,
      opens: Number(r.opens ?? 0),
      clicks: Number(r.clicks ?? 0),
      unsubscribes: Number(r.unsubscribes ?? 0),
      bounces: Number(r.bounces ?? 0),
      revenue: r.revenue !== null && r.revenue !== undefined ? Number(r.revenue) : null,
      aiAssisted: Boolean(r.ai_assisted),
      createdAt: r.created_at,
    }
  }

  return {
    drafts: ((draftRes.data ?? []) as RawEmail[]).map(toRow),
    scheduled: ((schedRes.data ?? []) as RawEmail[]).map(toRow),
    sent: ((sentRes.data ?? []) as RawEmail[]).map(toRow),
  }
}

export interface ClientStub { id: string; name: string }

export async function listClientsForCampaign(): Promise<ClientStub[]> {
  const supabase = await createServerClient()
  const { data } = await supabase.from('clients').select('id, name').order('name', { ascending: true }).limit(100)
  return ((data ?? []) as Array<{ id: string; name: string | null }>).map(c => ({
    id: c.id,
    name: c.name ?? 'Unnamed',
  }))
}
