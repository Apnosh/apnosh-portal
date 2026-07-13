/**
 * verify-catalog-live-parity — proves the catalog_services DB rows render byte-identical
 * to the committed catalog.generated.ts snapshot. This is the gate before the plan engine
 * reads the catalog from the DB at runtime: if the DB is already the exact source of the
 * frozen snapshot, a live read cannot change any composed plan. Read-only.
 *
 * Run: node_modules/.bin/tsx scripts/verify-catalog-live-parity.ts
 */
import * as fs from 'fs'
import * as path from 'path'
import { createClient } from '@supabase/supabase-js'
import { rowToService, renderGeneratedSnapshot, type CatalogRow } from '../src/lib/campaigns/data/catalog-db-shape'
import { buildPricedCatalog, PRICED_CATALOG } from '../src/lib/campaigns/data/priced-catalog'

function envVal(key: string): string {
  const raw = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8')
  const m = raw.match(new RegExp('^' + key + '=(.*)$', 'm'))
  return m ? m[1].trim().replace(/^"|"$/g, '') : ''
}

async function main() {
  const sb = createClient(envVal('NEXT_PUBLIC_SUPABASE_URL'), envVal('SUPABASE_SERVICE_ROLE_KEY'))
  const { data, error } = await sb
    .from('catalog_services').select('*').eq('status', 'active').order('sort_order', { ascending: true })
  if (error) { console.error('DB read failed:', error.message); process.exit(1) }
  const rows = (data ?? []) as CatalogRow[]
  const rendered = renderGeneratedSnapshot(rows.map(rowToService))
  const committed = fs.readFileSync(path.join(process.cwd(), 'src/lib/campaigns/data/catalog.generated.ts'), 'utf8')

  // Check 2 (the one that matters for the flip): the ASSEMBLED live catalog — the exact
  // PricedService[] the composer consumes — deep-equals the frozen PRICED_CATALOG. Since the
  // composer is a pure function of this array, identical input guarantees identical plans.
  const live = buildPricedCatalog(rows.map(rowToService))
  const assembledMatch = JSON.stringify(live) === JSON.stringify(PRICED_CATALOG)

  if (rendered === committed && assembledMatch) {
    console.log(`PASS — ${rows.length} active services.`)
    console.log('  · DB renders byte-identical to catalog.generated.ts.')
    console.log(`  · Assembled live catalog (${live.length}) deep-equals PRICED_CATALOG (${PRICED_CATALOG.length}) — the exact input the composer uses.`)
    console.log('The database is a faithful source of the live catalog. Safe to read from it at runtime.')
    return
  }
  if (rendered === committed && !assembledMatch) {
    console.log(`SNAPSHOT MATCHES but ASSEMBLED catalog differs (live ${live.length} vs PRICED_CATALOG ${PRICED_CATALOG.length}). Investigate buildPricedCatalog / EXTRA_SERVICES.`)
    process.exit(2)
  }

  // Not identical — surface where they diverge so we can reconcile before any live read.
  const a = rendered.split('\n'), b = committed.split('\n')
  console.log(`DIFFERS — ${rows.length} active services. rendered ${a.length} lines vs committed ${b.length} lines.`)
  let shown = 0
  for (let i = 0; i < Math.max(a.length, b.length) && shown < 20; i++) {
    if (a[i] !== b[i]) { console.log(`  L${i + 1}\n    DB:   ${a[i] ?? '<none>'}\n    file: ${b[i] ?? '<none>'}`); shown++ }
  }
  process.exit(2)
}

main().catch((e) => { console.error(e); process.exit(1) })
