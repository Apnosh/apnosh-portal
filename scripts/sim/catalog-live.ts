/**
 * Phase 4b verification — G3 live catalog. Proves the two gates the flip requires:
 *   (b) NO DRIFT: the assembled DB-live catalog is BYTE-IDENTICAL to the committed snapshot for the
 *       current catalog — so reading live can't move any unedited price.
 *   (a) PROPAGATION: an admin price edit in catalog_services flows through loadCatalogFromDb (the
 *       store's source) AND the serviceById overlay with NO rebuild. The edit is made, observed, then
 *       RESTORED byte-identically, and (b) is re-verified so the real catalog is left pristine.
 *
 * Read-mostly + self-restoring. Run:
 *   npx tsx --tsconfig scripts/sim/tsconfig.json scripts/sim/catalog-live.ts
 */
import { config } from 'dotenv'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadCatalogFromDb } from '@/lib/campaigns/data/catalog-live'
import { buildPricedCatalog, PRICED_CATALOG } from '@/lib/campaigns/data/priced-catalog'
import { rowToService, type CatalogRow } from '@/lib/campaigns/data/catalog-db-shape'
import { serviceById, registerLiveServices, clearLiveServices } from '@/lib/campaigns/catalog'
import { Suite } from './lib'

config({ path: '.env.local' })

/** Byte-identical snapshot vs assembled DB-live catalog. */
async function assembledMatchesSnapshot(a: ReturnType<typeof createAdminClient>): Promise<boolean> {
  const { data } = await a.from('catalog_services').select('*').eq('status', 'active').order('sort_order', { ascending: true })
  const live = buildPricedCatalog((data as CatalogRow[]).map(rowToService))
  return JSON.stringify(live) === JSON.stringify(PRICED_CATALOG)
}

async function main() {
  const a = createAdminClient()
  const s = new Suite()

  // ── (b) no drift, current catalog ────────────────────────────────────────────────
  s.group('(b) no drift — DB-live == snapshot for the current catalog')
  s.check('assembled DB-live catalog is byte-identical to PRICED_CATALOG', await assembledMatchesSnapshot(a))
  const live0 = await loadCatalogFromDb()
  s.eq('loadCatalogFromDb() deep-equals PRICED_CATALOG (the composer input)', JSON.stringify(live0), JSON.stringify(PRICED_CATALOG))

  // ── overlay mechanism (pure, no DB mutation) ─────────────────────────────────────
  s.group('serviceById overlay — snapshot is the seed, live wins')
  const sample = PRICED_CATALOG.find((x) => x.prices?.[0] && typeof x.prices[0].amount === 'number')!
  clearLiveServices()
  s.eq('before any register: serviceById returns the snapshot price', serviceById(sample.id)?.prices[0].amount, sample.prices[0].amount)
  const bumped = { ...sample, prices: [{ ...sample.prices[0], amount: sample.prices[0].amount + 7 }, ...sample.prices.slice(1)] }
  registerLiveServices([bumped])
  s.eq('after register: serviceById returns the LIVE (edited) price', serviceById(sample.id)?.prices[0].amount, sample.prices[0].amount + 7)
  clearLiveServices()
  s.eq('after clear: serviceById falls back to the snapshot again', serviceById(sample.id)?.prices[0].amount, sample.prices[0].amount)

  // ── (a) a real DB edit propagates through loadCatalogFromDb, then is restored ─────
  s.group('(a) an admin price edit propagates with no rebuild')
  const { data: target } = await a.from('catalog_services').select('id, prices').eq('status', 'active').order('sort_order', { ascending: true }).limit(1).maybeSingle()
  const svcId = target?.id as string
  const original = target?.prices as Array<{ amount: number }>
  s.check('picked a target service with a numeric price', !!svcId && Array.isArray(original) && typeof original[0]?.amount === 'number', svcId)
  const MARKER = (original?.[0]?.amount ?? 0) + 13
  let restored = false
  try {
    const edited = [{ ...original[0], amount: MARKER }, ...original.slice(1)]
    const { error: upErr } = await a.from('catalog_services').update({ prices: edited }).eq('id', svcId)
    s.check('DB price edit applied', !upErr, upErr?.message)

    // The store's source reflects the edit immediately (no deploy, no snapshot rebuild).
    const liveAfter = await loadCatalogFromDb()
    const editedSvc = liveAfter.find((x) => x.id === svcId)
    s.eq('loadCatalogFromDb() reflects the edited price', editedSvc?.prices[0].amount, MARKER)

    // And the overlay makes serviceById return it (what the client composes with).
    registerLiveServices(liveAfter)
    s.eq('serviceById returns the edited price after overlay', serviceById(svcId)?.prices[0].amount, MARKER)
    clearLiveServices()
  } finally {
    // Restore the exact original prices — the real catalog must be left pristine.
    const { error: rErr } = await a.from('catalog_services').update({ prices: original }).eq('id', svcId)
    restored = !rErr
    clearLiveServices()
  }
  s.check('original price restored', restored)
  const { data: check } = await a.from('catalog_services').select('prices').eq('id', svcId).maybeSingle()
  s.eq('restored prices byte-identical to original', JSON.stringify(check?.prices), JSON.stringify(original))

  s.group('(b) re-verify after restore — catalog left pristine')
  s.check('assembled DB-live catalog is byte-identical to PRICED_CATALOG again', await assembledMatchesSnapshot(a))

  const ok = s.report('Phase 4b — G3 live catalog (parity + propagation)')
  process.exit(ok ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
