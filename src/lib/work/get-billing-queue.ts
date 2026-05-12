/**
 * Finance ops queue: overdue + open invoices first, then recent paid,
 * plus per-client usage signal so finance can see which clients are
 * under-utilizing their tier (downsell risk) and which are
 * over-utilizing (upsell opportunity).
 *
 * Usage is read directly from the operational tables we already
 * populate elsewhere — drafts, posts, replies, reviews, generations
 * — no separate analytics pipeline needed.
 */

import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type InvoiceStatus = 'draft' | 'open' | 'paid' | 'uncollectible' | 'void' | 'past_due'

export interface InvoiceRow {
  id: string
  clientId: string
  clientName: string | null
  invoiceNumber: string | null
  status: InvoiceStatus
  totalCents: number
  amountDueCents: number
  amountPaidCents: number
  currency: string
  issuedAt: string | null
  dueAt: string | null
  paidAt: string | null
  isOverdue: boolean
  daysOverdue: number | null
  hostedUrl: string | null
  description: string | null
}

export interface ClientUsageRow {
  clientId: string
  clientName: string
  tier: string
  monthlyRateCents: number | null
  // 30d activity
  draftsCreated: number
  postsPublished: number
  totalEngagement: number
  repliesSent: number
  reviewsAnswered: number
  campaignsSent: number
  aiGenerations: number
  unpaidCents: number
}

export interface BillingData {
  invoices: {
    overdue: InvoiceRow[]
    open: InvoiceRow[]
    paid: InvoiceRow[]
  }
  totals: {
    overdueCents: number
    openCents: number
    paid30dCents: number
    overdueCount: number
  }
  clientUsage: ClientUsageRow[]
}

interface RawInvoice {
  id: string
  client_id: string
  invoice_number: string | null
  status: InvoiceStatus
  total_cents: number | string
  amount_due_cents: number | string
  amount_paid_cents: number | string
  currency: string | null
  issued_at: string | null
  due_at: string | null
  paid_at: string | null
  hosted_invoice_url: string | null
  description: string | null
}

const SELECT = 'id, client_id, invoice_number, status, total_cents, amount_due_cents, amount_paid_cents, currency, issued_at, due_at, paid_at, hosted_invoice_url, description'

export async function getBillingData(): Promise<BillingData> {
  // Finance is unscoped (it's ops, not client-book). Read with admin
  // client to get the full picture.
  const admin = createAdminClient()
  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const [openRes, paidRes, clientsRes] = await Promise.all([
    admin.from('invoices').select(SELECT).in('status', ['open', 'past_due', 'draft']).order('due_at', { ascending: true, nullsFirst: false }).limit(50),
    admin.from('invoices').select(SELECT).eq('status', 'paid').gte('paid_at', thirtyDaysAgo).order('paid_at', { ascending: false }).limit(30),
    admin.from('clients').select('id, name, tier, monthly_rate, status').neq('status', 'churned'),
  ])

  const clients = (clientsRes.data ?? []) as Array<{ id: string; name: string | null; tier: string | null; monthly_rate: number | string | null; status: string | null }>
  const clientMap = new Map(clients.map(c => [c.id, { name: c.name, tier: c.tier ?? 'Basic', monthlyRate: c.monthly_rate ? Number(c.monthly_rate) : null }]))

  const toRow = (r: RawInvoice): InvoiceRow => {
    const dueAt = r.due_at ? new Date(r.due_at) : null
    const isOverdue = (r.status === 'open' || r.status === 'past_due') && dueAt !== null && dueAt < now
    const daysOverdue = isOverdue && dueAt ? Math.floor((now.getTime() - dueAt.getTime()) / 86_400_000) : null
    return {
      id: r.id,
      clientId: r.client_id,
      clientName: clientMap.get(r.client_id)?.name ?? null,
      invoiceNumber: r.invoice_number,
      status: r.status,
      totalCents: Number(r.total_cents ?? 0),
      amountDueCents: Number(r.amount_due_cents ?? 0),
      amountPaidCents: Number(r.amount_paid_cents ?? 0),
      currency: r.currency ?? 'usd',
      issuedAt: r.issued_at,
      dueAt: r.due_at,
      paidAt: r.paid_at,
      isOverdue,
      daysOverdue,
      hostedUrl: r.hosted_invoice_url,
      description: r.description,
    }
  }

  const openRows = ((openRes.data ?? []) as RawInvoice[]).map(toRow)
  const paidRows = ((paidRes.data ?? []) as RawInvoice[]).map(toRow)

  const overdueRows = openRows.filter(r => r.isOverdue)
  const stillOpenRows = openRows.filter(r => !r.isOverdue)

  const totals = {
    overdueCents: overdueRows.reduce((s, r) => s + r.amountDueCents, 0),
    openCents: stillOpenRows.reduce((s, r) => s + r.amountDueCents, 0),
    paid30dCents: paidRows.reduce((s, r) => s + r.amountPaidCents, 0),
    overdueCount: overdueRows.length,
  }

  // Per-client usage (30d) — read with regular client so RLS limits to
  // the operator's book. But finance is admin/global — use admin for
  // the full picture.
  const supabase = await createServerClient()
  void supabase  // not used here; kept for future RLS scoping
  const allClientIds = clients.map(c => c.id)
  if (allClientIds.length === 0) {
    return {
      invoices: { overdue: overdueRows, open: stillOpenRows, paid: paidRows },
      totals,
      clientUsage: [],
    }
  }

  const [draftsRes, postsRes, repliesRes, reviewsRes, campaignsRes, generationsRes, unpaidRes] = await Promise.all([
    admin.from('content_drafts').select('client_id').gte('created_at', thirtyDaysAgo),
    admin.from('social_posts').select('client_id, total_interactions').gte('posted_at', thirtyDaysAgo),
    admin.from('social_interactions').select('client_id').eq('status', 'replied').gte('reply_at', thirtyDaysAgo),
    admin.from('local_reviews').select('client_id').eq('status', 'replied').gte('reply_at', thirtyDaysAgo),
    admin.from('email_campaigns').select('client_id').eq('status', 'sent').gte('sent_at', thirtyDaysAgo),
    admin.from('ai_generations').select('client_id').gte('created_at', thirtyDaysAgo),
    admin.from('invoices').select('client_id, amount_due_cents').in('status', ['open', 'past_due']),
  ])

  const usage = new Map<string, ClientUsageRow>()
  for (const c of clients) {
    usage.set(c.id, {
      clientId: c.id,
      clientName: c.name ?? '—',
      tier: c.tier ?? 'Basic',
      monthlyRateCents: c.monthly_rate ? Math.round(Number(c.monthly_rate) * 100) : null,
      draftsCreated: 0, postsPublished: 0, totalEngagement: 0,
      repliesSent: 0, reviewsAnswered: 0, campaignsSent: 0,
      aiGenerations: 0, unpaidCents: 0,
    })
  }
  const bump = (id: string, patch: Partial<ClientUsageRow>) => {
    const r = usage.get(id)
    if (!r) return
    Object.assign(r, {
      draftsCreated: r.draftsCreated + (patch.draftsCreated ?? 0),
      postsPublished: r.postsPublished + (patch.postsPublished ?? 0),
      totalEngagement: r.totalEngagement + (patch.totalEngagement ?? 0),
      repliesSent: r.repliesSent + (patch.repliesSent ?? 0),
      reviewsAnswered: r.reviewsAnswered + (patch.reviewsAnswered ?? 0),
      campaignsSent: r.campaignsSent + (patch.campaignsSent ?? 0),
      aiGenerations: r.aiGenerations + (patch.aiGenerations ?? 0),
      unpaidCents: r.unpaidCents + (patch.unpaidCents ?? 0),
    })
  }
  for (const r of draftsRes.data ?? []) bump(r.client_id as string, { draftsCreated: 1 })
  for (const r of postsRes.data ?? []) bump(r.client_id as string, { postsPublished: 1, totalEngagement: Number(r.total_interactions ?? 0) })
  for (const r of repliesRes.data ?? []) bump(r.client_id as string, { repliesSent: 1 })
  for (const r of reviewsRes.data ?? []) bump(r.client_id as string, { reviewsAnswered: 1 })
  for (const r of campaignsRes.data ?? []) bump(r.client_id as string, { campaignsSent: 1 })
  for (const r of generationsRes.data ?? []) bump(r.client_id as string, { aiGenerations: 1 })
  for (const r of unpaidRes.data ?? []) bump(r.client_id as string, { unpaidCents: Number(r.amount_due_cents ?? 0) })

  // Sort: most active first
  const clientUsage = Array.from(usage.values())
    .sort((a, b) => (b.draftsCreated + b.postsPublished + b.repliesSent + b.reviewsAnswered + b.campaignsSent)
                  - (a.draftsCreated + a.postsPublished + a.repliesSent + a.reviewsAnswered + a.campaignsSent))

  return {
    invoices: { overdue: overdueRows, open: stillOpenRows, paid: paidRows },
    totals,
    clientUsage,
  }
}
