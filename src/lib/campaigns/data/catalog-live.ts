import 'server-only'
/**
 * catalog-live — the live catalog, read from the catalog_services DB rows and assembled
 * into the EXACT runtime shape the plan composer consumes (buildPricedCatalog: withSendInfra
 * + EXTRA_SERVICES). This is the foundation for instant go-live: once the composer reads
 * getLiveCatalog() (Stage 3), an admin edit reaches restaurants on the next request, no deploy.
 *
 * SAFETY: falls back to the frozen snapshot (PRICED_CATALOG) on ANY error or empty result, so a
 * DB hiccup can never break composition. Proven equivalent to the snapshot by
 * scripts/verify-catalog-live-parity.ts while the DB and the committed file agree.
 */
import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { rowToService, type CatalogRow } from './catalog-db-shape'
import { buildPricedCatalog, PRICED_CATALOG, type PricedService } from './priced-catalog'

/** Cache tag the admin Publish action revalidates so edits go live without a deploy. */
export const CATALOG_CACHE_TAG = 'catalog'

/** Read + assemble the live catalog from the DB. Uncached — callers use getLiveCatalog(). */
export async function loadCatalogFromDb(): Promise<PricedService[]> {
  try {
    const sb = createAdminClient()
    const { data, error } = await sb
      .from('catalog_services').select('*').eq('status', 'active').order('sort_order', { ascending: true })
    if (error || !data || data.length === 0) return PRICED_CATALOG
    return buildPricedCatalog((data as CatalogRow[]).map(rowToService))
  } catch {
    return PRICED_CATALOG // never let a catalog read failure break plan composition
  }
}

/** The cached live catalog. Revalidated by tag on Publish; a 5-minute TTL self-heals otherwise. */
export const getLiveCatalog = unstable_cache(loadCatalogFromDb, ['live-catalog-v1'], {
  tags: [CATALOG_CACHE_TAG],
  revalidate: 300,
})
