/**
 * gen-catalog.ts — the "Publish" step. Reads the catalog_services table (the source of truth)
 * and writes src/lib/campaigns/data/catalog.generated.ts, the frozen TS snapshot the pure/sync
 * composer imports. Run: npx tsx scripts/gen-catalog.ts  (or the admin Publish button later).
 *
 * The composer NEVER reads the DB at request time — only this generated file — so composePlanForGoal
 * stays synchronous + client-safe. rowToService rebuilds the exact in-code shape from each row.
 *
 * Auth: prefers a real service-role key (SUPABASE_SERVICE_ROLE_KEY) via supabase-js; if that slot
 * holds a personal access token (sbp_...), or SUPABASE_ACCESS_TOKEN is set, it reads via the
 * Management API query endpoint instead.
 */
import { rowToService, renderGeneratedSnapshot, type CatalogRow } from '../src/lib/campaigns/data/catalog-db-shape'
import * as fs from 'fs'
import * as path from 'path'

function env(key: string): string {
  if (process.env[key]) return process.env[key]!
  try {
    const txt = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8')
    const m = txt.match(new RegExp('^' + key + '=(.+)$', 'm'))
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : ''
  } catch { return '' }
}

const j = (v: unknown) => (typeof v === 'string' ? JSON.parse(v) : v)
const normalize = (r: Record<string, unknown>): CatalogRow => ({
  ...(r as object),
  prices: j(r.prices), goal_plays: j(r.goal_plays), fit: j(r.fit), pieces: j(r.pieces), metric: j(r.metric), deliverables: j(r.deliverables),
} as CatalogRow)

const QUERY = "select * from catalog_services where status = 'active' order by sort_order asc"

async function fetchRows(): Promise<CatalogRow[]> {
  const url = env('NEXT_PUBLIC_SUPABASE_URL')
  const svc = env('SUPABASE_SERVICE_ROLE_KEY')
  const pat = env('SUPABASE_ACCESS_TOKEN') || (svc.startsWith('sbp_') ? svc : '')
  if (pat) {
    const ref = url.replace(/^https?:\/\//, '').split('.')[0]
    const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${pat}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: QUERY }),
    })
    if (!res.ok) throw new Error(`Management API ${res.status}: ${await res.text()}`)
    return ((await res.json()) as Record<string, unknown>[]).map(normalize)
  }
  const { createClient } = await import('@supabase/supabase-js')
  const sb = createClient(url, svc, { auth: { persistSession: false } })
  const { data, error } = await sb.from('catalog_services').select('*').eq('status', 'active').order('sort_order', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => normalize(r as Record<string, unknown>))
}

async function main() {
  const rows = await fetchRows()
  if (!rows.length) throw new Error('catalog_services returned no active rows — refusing to write an empty catalog')
  const services = rows.map(rowToService)
  // Shared renderer so the CLI and the admin Publish button produce a byte-identical file.
  const out = renderGeneratedSnapshot(services)
  const dest = path.join(process.cwd(), 'src/lib/campaigns/data/catalog.generated.ts')
  fs.writeFileSync(dest, out)
  console.log(`wrote ${path.relative(process.cwd(), dest)} with ${services.length} services`)
}
main().catch((e) => { console.error('gen-catalog failed:', e?.message || e); process.exit(1) })
