/**
 * Read-only check: does Do Si KBBQ exist in Supabase?
 * Lists all clients, then probes related tables for Do Si specifically.
 *
 * Run: npx tsx scripts/check-do-si.ts
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { resolve } from 'path'

dotenv.config({ path: resolve(__dirname, '../.env.local') })

const s = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

async function main() {
  console.log('\n=== ALL CLIENTS ===')
  const { data: clients, error: cErr } = await s
    .from('clients')
    .select('id, name, slug, industry, services_active, status')
    .order('name')
  if (cErr) {
    console.error('clients query failed:', cErr.message)
    process.exit(1)
  }
  for (const c of clients ?? []) {
    console.log(`  ${c.name.padEnd(28)} | slug=${c.slug ?? '—'} | services=${JSON.stringify(c.services_active)} | status=${c.status ?? '—'}`)
  }

  // Find Do Si row(s)
  const doSi = (clients ?? []).find(c =>
    c.name.toLowerCase().includes('do si') ||
    c.name.toLowerCase().includes('dosi'),
  )

  console.log('\n=== DO SI DETAIL ===')
  if (!doSi) {
    console.log('  ❌ Do Si not found. populate-clients.ts has NOT been run (or Do Si name differs).')
    return
  }
  console.log(`  ✅ Found: ${doSi.name} (id=${doSi.id})`)
  console.log(`  services_active: ${JSON.stringify(doSi.services_active)}`)

  const probes: { table: string; filter: Record<string, string> }[] = [
    { table: 'client_locations', filter: { client_id: doSi.id } },
    { table: 'client_brands', filter: { client_id: doSi.id } },
    { table: 'client_users', filter: { client_id: doSi.id } },
    { table: 'platform_connections', filter: { client_id: doSi.id } },
    { table: 'channel_connections', filter: { client_id: doSi.id } },
    { table: 'weekly_briefs', filter: { client_id: doSi.id } },
    { table: 'messages', filter: { client_id: doSi.id } },
    { table: 'menu_items', filter: { client_id: doSi.id } },
    { table: 'client_specials', filter: { client_id: doSi.id } },
  ]

  for (const p of probes) {
    const { count, error } = await s
      .from(p.table)
      .select('*', { count: 'exact', head: true })
      .match(p.filter)
    if (error) {
      console.log(`  ${p.table.padEnd(24)} ⚠ error: ${error.message}`)
    } else {
      console.log(`  ${p.table.padEnd(24)} count=${count ?? 0}`)
    }
  }
}

main().then(() => process.exit(0)).catch(e => {
  console.error(e)
  process.exit(1)
})
