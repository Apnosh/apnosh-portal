/**
 * Web team's queue: per-client health snapshot + recent page drafts.
 * RLS scoped via 118 policies (web_ops / web_designer / web_developer
 * read on assigned book).
 */

import { createClient as createServerClient } from '@/lib/supabase/server'

export type HealthStatus = 'green' | 'yellow' | 'red' | 'unknown'

export interface SiteHealthRow {
  clientId: string
  clientName: string | null
  clientSlug: string | null
  uptimeStatus: HealthStatus
  uptimePct30d: number | null
  pagespeedMobile: number | null
  pagespeedDesktop: number | null
  sslValid: boolean | null
  sslExpiresAt: string | null
  lastContentUpdateAt: string | null
}

export interface PageDraftRow {
  id: string
  clientId: string
  clientName: string | null
  pageKind: string
  pageLabel: string | null
  headline: string | null
  subhead: string | null
  bodyMd: string
  ctaText: string | null
  ctaUrl: string | null
  status: 'draft' | 'in_review' | 'approved' | 'shipped' | 'archived'
  aiAssisted: boolean
  createdAt: string
  updatedAt: string
}

export interface WebData {
  health: SiteHealthRow[]
  drafts: {
    inFlight: PageDraftRow[]   // draft / in_review / approved
    shipped: PageDraftRow[]    // shipped / archived
  }
  clients: Array<{ id: string; name: string }>
}

interface RawDraft {
  id: string; client_id: string; page_kind: string; page_label: string | null
  headline: string | null; subhead: string | null; body_md: string
  cta_text: string | null; cta_url: string | null
  status: PageDraftRow['status']; ai_assisted: boolean
  created_at: string; updated_at: string
}

const IN_FLIGHT: Array<PageDraftRow['status']> = ['draft', 'in_review', 'approved']
const SHIPPED:   Array<PageDraftRow['status']> = ['shipped', 'archived']

export async function getWebData(): Promise<WebData> {
  const supabase = await createServerClient()

  const [healthRes, inFlightRes, shippedRes, clientsRes] = await Promise.all([
    supabase
      .from('website_health')
      .select('client_id, uptime_status, uptime_pct_30d, pagespeed_mobile, pagespeed_desktop, ssl_valid, ssl_expires_at, last_content_update_at')
      .limit(50),
    supabase
      .from('web_page_drafts')
      .select('id, client_id, page_kind, page_label, headline, subhead, body_md, cta_text, cta_url, status, ai_assisted, created_at, updated_at')
      .in('status', IN_FLIGHT)
      .order('updated_at', { ascending: false })
      .limit(30),
    supabase
      .from('web_page_drafts')
      .select('id, client_id, page_kind, page_label, headline, subhead, body_md, cta_text, cta_url, status, ai_assisted, created_at, updated_at')
      .in('status', SHIPPED)
      .order('shipped_at', { ascending: false, nullsFirst: false })
      .limit(15),
    supabase
      .from('clients')
      .select('id, name')
      .neq('status', 'churned')
      .order('name', { ascending: true })
      .limit(100),
  ])

  const clients = ((clientsRes.data ?? []) as Array<{ id: string; name: string | null }>)
    .map(c => ({ id: c.id, name: c.name ?? 'Unnamed' }))
  const clientMap = new Map(clients.map(c => [c.id, c.name]))

  const health: SiteHealthRow[] = ((healthRes.data ?? []) as Array<Record<string, unknown>>).map(r => ({
    clientId: r.client_id as string,
    clientName: clientMap.get(r.client_id as string) ?? null,
    clientSlug: null,
    uptimeStatus: ((r.uptime_status as string) ?? 'unknown') as HealthStatus,
    uptimePct30d: r.uptime_pct_30d !== null && r.uptime_pct_30d !== undefined ? Number(r.uptime_pct_30d) : null,
    pagespeedMobile: r.pagespeed_mobile !== null && r.pagespeed_mobile !== undefined ? Number(r.pagespeed_mobile) : null,
    pagespeedDesktop: r.pagespeed_desktop !== null && r.pagespeed_desktop !== undefined ? Number(r.pagespeed_desktop) : null,
    sslValid: r.ssl_valid !== undefined ? (r.ssl_valid as boolean) : null,
    sslExpiresAt: (r.ssl_expires_at as string) ?? null,
    lastContentUpdateAt: (r.last_content_update_at as string) ?? null,
  }))

  const toRow = (r: RawDraft): PageDraftRow => ({
    id: r.id,
    clientId: r.client_id,
    clientName: clientMap.get(r.client_id) ?? null,
    pageKind: r.page_kind,
    pageLabel: r.page_label,
    headline: r.headline,
    subhead: r.subhead,
    bodyMd: r.body_md,
    ctaText: r.cta_text,
    ctaUrl: r.cta_url,
    status: r.status,
    aiAssisted: r.ai_assisted,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  })

  return {
    health,
    drafts: {
      inFlight: ((inFlightRes.data ?? []) as RawDraft[]).map(toRow),
      shipped: ((shippedRes.data ?? []) as RawDraft[]).map(toRow),
    },
    clients,
  }
}
