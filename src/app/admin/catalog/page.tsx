/**
 * /admin/catalog — the editable service catalog (the heart). Reads the live catalog_services rows
 * (admin session + RLS) and hands them to CatalogAdmin, which edits + publishes. Admin-only.
 */
import { requireAdminUser } from '@/lib/auth/require-admin'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { CatalogAdmin, type ServiceUsage } from './catalog-admin'
import type { CatalogRow } from '@/lib/campaigns/data/catalog-db-shape'

export const dynamic = 'force-dynamic'

/** Per-card usage: how many campaigns include it, and how many of those are live (shipped).
 *  Service role so the counts are complete regardless of per-client RLS. Best-effort — a read
 *  failure just leaves the badges off. */
async function loadUsage(): Promise<ServiceUsage> {
  const usage: ServiceUsage = {}
  try {
    const admin = createAdminClient()
    const [{ data: lines }, { data: camps }] = await Promise.all([
      admin.from('campaign_line_items').select('service_id, campaign_id, included'),
      admin.from('campaigns').select('id, status'),
    ])
    const liveById = new Map((camps ?? []).map((c) => [c.id as string, (c.status as string) === 'shipped']))
    for (const l of lines ?? []) {
      if (!(l.included as boolean)) continue
      const id = l.service_id as string
      const u = usage[id] ?? { total: 0, live: 0 }
      u.total++
      if (liveById.get(l.campaign_id as string)) u.live++
      usage[id] = u
    }
  } catch { /* leave usage empty */ }
  return usage
}

export default async function AdminCatalogPage() {
  await requireAdminUser()
  const sb = await createClient()
  const [{ data }, usage] = await Promise.all([
    sb.from('catalog_services').select('*').order('section', { ascending: true }).order('sort_order', { ascending: true }),
    loadUsage(),
  ])
  return <CatalogAdmin rows={(data ?? []) as CatalogRow[]} usage={usage} />
}
