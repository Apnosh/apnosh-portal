/**
 * Backfill service_work_orders.steps for orders minted BEFORE their playbook existed.
 *
 * Phase 2 authored playbooks for site-menu, listings-sync, local-seo, delivery-opt, nextdoor-local,
 * review-responses, google-food-order, photo-library, and paid-ads. Any work order shipped before
 * that carries an EMPTY steps array (seedSteps() returned [] at mint time), so the operator cockpit
 * shows no checklist for it. This re-seeds those rows from the now-authored playbook.
 *
 * SAFE + IDEMPOTENT by construction:
 *   - only touches rows whose steps is NULL or an empty array (a row that already has a checklist,
 *     or an operator's in-progress work, is never overwritten),
 *   - never touches a 'delivered' row (a closed record),
 *   - only fills a serviceId that HAS an authored playbook (others legitimately have no steps yet).
 * Re-running it is a no-op once every eligible row is filled.
 *
 * OWNER-RUN. Reads Supabase via the service role from .env.local. Dry-run by default — it prints what
 * it WOULD change and writes nothing. Pass --apply to actually write.
 *
 *   npx tsx scripts/backfill-service-wo-steps.ts            # dry run (no writes)
 *   npx tsx scripts/backfill-service-wo-steps.ts --apply    # perform the backfill
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'
import { seedSteps } from '../src/lib/campaigns/data/service-playbooks'

const APPLY = process.argv.includes('--apply')

function isEmptySteps(steps: unknown): boolean {
  return steps == null || (Array.isArray(steps) && steps.length === 0)
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
    process.exit(1)
  }
  const sb = createClient(url, key)

  const { data, error } = await sb
    .from('service_work_orders')
    .select('id, service_id, status, steps')
  if (error) {
    console.error('Read failed:', error.message)
    process.exit(1)
  }

  const rows = data ?? []
  const eligible = rows.filter((r) => {
    if (r.status === 'delivered') return false           // closed record — never touch
    if (!isEmptySteps(r.steps)) return false             // already has a checklist / operator work
    const seeded = seedSteps(r.service_id as string)     // only services with an authored playbook
    return seeded.length > 0
  })

  console.log(`Scanned ${rows.length} service work orders.`)
  console.log(`${eligible.length} eligible for backfill (empty steps + authored playbook + not delivered).`)
  const byService: Record<string, number> = {}
  for (const r of eligible) byService[r.service_id as string] = (byService[r.service_id as string] ?? 0) + 1
  for (const [svc, n] of Object.entries(byService)) console.log(`  ${svc}: ${n}`)

  if (!eligible.length) { console.log('Nothing to backfill.'); return }
  if (!APPLY) { console.log('\nDRY RUN — no writes. Re-run with --apply to perform the backfill.'); return }

  let ok = 0, fail = 0
  for (const r of eligible) {
    const steps = seedSteps(r.service_id as string)
    const { error: upErr } = await sb
      .from('service_work_orders')
      .update({ steps, updated_at: new Date().toISOString() })
      .eq('id', r.id as string)
      .or('steps.is.null,steps.eq.[]')   // re-assert the empty guard at write time (race-safe)
    if (upErr) { fail++; console.error(`  FAIL ${r.id}: ${upErr.message}`) } else { ok++ }
  }
  console.log(`\nBackfilled ${ok} order(s)${fail ? `, ${fail} failed` : ''}.`)
}

main().catch((e) => { console.error(e); process.exit(1) })
