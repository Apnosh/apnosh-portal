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

  if (rendered === committed) {
    console.log(`PASS — ${rows.length} active services; DB renders byte-identical to catalog.generated.ts.`)
    console.log('The database is already the faithful source of the live catalog. Safe to read from it at runtime.')
    return
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
