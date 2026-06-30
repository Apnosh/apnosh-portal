/**
 * /admin/catalog — the editable service catalog (the heart). Reads the live catalog_services rows
 * (admin session + RLS) and hands them to CatalogAdmin, which edits + publishes. Admin-only.
 */
import { requireAdminUser } from '@/lib/auth/require-admin'
import { createClient } from '@/lib/supabase/server'
import { CatalogAdmin } from './catalog-admin'
import type { CatalogRow } from '@/lib/campaigns/data/catalog-db-shape'

export const dynamic = 'force-dynamic'

export default async function AdminCatalogPage() {
  await requireAdminUser()
  const sb = await createClient()
  const { data } = await sb.from('catalog_services').select('*').order('section', { ascending: true }).order('sort_order', { ascending: true })
  return <CatalogAdmin rows={(data ?? []) as CatalogRow[]} />
}
