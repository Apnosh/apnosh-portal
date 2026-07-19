/**
 * GET /api/dashboard/catalog-content — the store's CMS payload:
 *  - overrides: the sparse campaign-content overrides overlaid onto the in-code
 *    CAMPAIGN_CONTENT records (Phase C1),
 *  - campaigns: LIVE admin-created DB campaigns (Phase C2), sparse ([] when none),
 *    which the builder registers into the runtime catalog.
 *  - services: the DB-LIVE catalog (Phase 4b / G3) — getLiveCatalog assembled from
 *    catalog_services, which the builder overlays onto serviceById so an admin price/
 *    service edit reaches the store with no deploy. Snapshot is the seed + fallback,
 *    and parity guarantees live == snapshot for every unedited service (no drift).
 *
 * Content is catalog-wide, not client-specific, so the auth check is just "signed
 * in" — same session read the other dashboard routes start from. Missing tables /
 * any read error degrades to {} / [] (the store then renders pure code content).
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getContentOverrides } from '@/lib/campaigns/content-overrides-server'
import { getDbCampaigns } from '@/lib/campaigns/catalog-campaigns-server'
import { loadCatalogFromDb } from '@/lib/campaigns/data/catalog-live'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 10

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })

  // loadCatalogFromDb reads the catalog_services rows FRESH (this route is force-dynamic / no-store),
  // so an admin edit propagates on the next store fetch with no deploy. It degrades to the frozen
  // snapshot on any DB error, so `services` is always the real composer input — never empty.
  const [overrides, campaigns, services] = await Promise.all([getContentOverrides(), getDbCampaigns(), loadCatalogFromDb().catch(() => [])])
  return NextResponse.json({ overrides, campaigns, services }, { headers: { 'Cache-Control': 'no-store' } })
}
