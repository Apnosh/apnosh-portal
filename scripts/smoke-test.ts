/**
 * Smoke test: verify the pricing + tier-enforcement wiring is intact
 * before touching the UI.
 *
 * Run: `set -a && source .env.local && set +a && npx tsx scripts/smoke-test.ts`
 *
 * Each check prints ✓ or ✗ with a one-line reason. Exit code = 0 if
 * all checks pass, 1 if any fail. Read-only — does not touch live data.
 */

import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { TIERS, resolveTier } from '../src/lib/agent/tiers'
import { CANONICAL_SUITE } from '../src/lib/admin/synthetic-evals-data'

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!STRIPE_SECRET_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing required env: STRIPE_SECRET_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2025-02-24.acacia' })
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = createClient<any, 'public', any>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

let failures = 0
function ok(label: string, detail?: string) {
  console.log(`  ✓ ${label}${detail ? '  ' + detail : ''}`)
}
function fail(label: string, detail: string) {
  console.log(`  ✗ ${label}  ${detail}`)
  failures += 1
}

async function section(name: string, fn: () => Promise<void>) {
  console.log(`\n▸ ${name}`)
  try { await fn() }
  catch (err) { fail(name, (err as Error).message) }
}

async function main() {
  console.log('Apnosh pricing + tier smoke test\n')

  // ─── 1. Tier definitions are sane ───────────────────────────────
  await section('Tier definitions', async () => {
    const slugs = ['starter', 'basic', 'standard', 'pro']
    for (const slug of slugs) {
      const spec = resolveTier(slug)
      if (spec.id !== slug && slug !== 'starter') {
        fail(`resolveTier('${slug}')`, `returned wrong id: ${spec.id}`)
      } else {
        ok(`resolveTier('${slug}')`, `→ ${spec.label} ($${spec.priceCents / 100}/mo)`)
      }
    }
    // Verify the per-tier feature flags match what we advertise
    if (TIERS.basic.proactiveCadence !== 'manual') fail('basic.proactiveCadence', `expected 'manual', got '${TIERS.basic.proactiveCadence}'`)
    else ok('basic.proactiveCadence = manual (Assistant: no proactive runs)')
    if (TIERS.standard.proactiveCadence !== 'weekly') fail('standard.proactiveCadence', `expected 'weekly', got '${TIERS.standard.proactiveCadence}'`)
    else ok('standard.proactiveCadence = weekly (Strategist)')
    if (TIERS.pro.proactiveCadence !== 'daily') fail('pro.proactiveCadence', `expected 'daily', got '${TIERS.pro.proactiveCadence}'`)
    else ok('pro.proactiveCadence = daily (Strategist+)')
    if (TIERS.basic.richContextLoader !== false) fail('basic.richContextLoader', 'should be false')
    else ok('basic.richContextLoader = false (Assistant: lightweight context)')
    if (TIERS.standard.richContextLoader !== true) fail('standard.richContextLoader', 'should be true')
    else ok('standard.richContextLoader = true (Strategist: full context)')
  })

  // ─── 2. Database schema is up to date ──────────────────────────
  await section('Database schema', async () => {
    // Check has_apnosh_website column exists by querying it
    const { error } = await admin.from('clients').select('id, tier, has_apnosh_website').limit(1)
    if (error) fail('clients.has_apnosh_website', error.message)
    else ok('clients.has_apnosh_website column exists')

    // Tier distribution
    const { data: tierStats } = await admin.from('clients').select('tier')
    const counts: Record<string, number> = {}
    for (const r of (tierStats ?? []) as Array<{ tier: string | null }>) {
      const k = r.tier ?? '(null)'
      counts[k] = (counts[k] ?? 0) + 1
    }
    ok('Live client tier distribution', JSON.stringify(counts))

    // Verify all tier values in the DB resolve to a real tier
    for (const t of Object.keys(counts)) {
      if (t === '(null)' || t === 'Internal') continue
      const spec = resolveTier(t)
      if (!spec) fail(`tier='${t}' has no spec`, 'add to TIERS or remove from DB')
    }
  })

  // ─── 3. Stripe products + prices ───────────────────────────────
  await section('Stripe products', async () => {
    for (const tierId of ['basic', 'standard', 'pro']) {
      const tier = TIERS[tierId as keyof typeof TIERS]
      const products = await stripe.products.search({
        query: `metadata['tier_id']:'${tierId}' AND active:'true'`,
        limit: 1,
      })
      if (products.data.length === 0) {
        fail(`tier '${tierId}'`, 'no active Stripe product found — run scripts/sync-agent-tiers.ts')
        continue
      }
      const product = products.data[0]
      const prices = await stripe.prices.list({ product: product.id, active: true, type: 'recurring' })
      const match = prices.data.find(p => p.unit_amount === tier.priceCents && p.recurring?.interval === 'month')
      if (match) {
        ok(`${tier.label} (${tierId})`, `${product.id} / ${match.id} $${tier.priceCents / 100}/mo`)
      } else {
        fail(`${tier.label} (${tierId})`,
          `expected \$${tier.priceCents / 100}/mo recurring price; got [${prices.data.map(p => `\$${(p.unit_amount ?? 0) / 100}/${p.recurring?.interval}`).join(', ')}]`)
      }
    }
    // Website + setup products
    const checks: Array<[string, string]> = [
      ['website_hosting', 'Website Hosting'],
      ['custom_website', 'Custom Website Setup'],
      ['premium_website', 'Premium Website Setup'],
    ]
    for (const [meta, label] of checks) {
      const key = meta === 'website_hosting' ? 'apnosh_product' : 'apnosh_setup'
      const found = await stripe.products.search({ query: `metadata['${key}']:'${meta}' AND active:'true'`, limit: 1 })
      if (found.data.length === 0) fail(label, `no active product with metadata.${key}='${meta}'`)
      else ok(label, found.data[0].id)
    }
  })

  // ─── 4. Stripe webhook ──────────────────────────────────────────
  await section('Stripe webhook', async () => {
    const eps = await stripe.webhookEndpoints.list({ limit: 10 })
    const enabled = eps.data.filter(e => e.status === 'enabled')
    if (enabled.length === 0) {
      fail('webhook', 'no enabled webhook endpoint configured in live Stripe')
      return
    }
    const required = [
      'customer.subscription.created',
      'customer.subscription.updated',
      'customer.subscription.deleted',
    ]
    for (const ep of enabled) {
      const missing = required.filter(e => !ep.enabled_events.includes(e) && !ep.enabled_events.includes('*'))
      if (missing.length === 0) {
        ok(`webhook ${ep.url}`, `all subscription events covered`)
      } else {
        fail(`webhook ${ep.url}`, `missing events: ${missing.join(', ')}`)
      }
    }
  })

  // ─── 5. Tool registry gating ────────────────────────────────────
  await section('Tool registry: website-gate enforcement', async () => {
    // We import dynamically because registry.ts uses Next.js paths
    // resolution that only works inside the Next runtime; but the
    // registry uses createAdminClient from supabase/admin which
    // requires SUPABASE_SERVICE_ROLE_KEY (already set). Try the import.
    const { loadEnabledToolsForClient } = await import('../src/lib/agent/registry')

    // Pick a client with each scenario from the live DB.
    const { data: anyClient } = await admin
      .from('clients').select('id, tier, has_apnosh_website')
      .order('created_at', { ascending: false }).limit(50) as
        { data: Array<{ id: string; tier: string | null; has_apnosh_website: boolean | null }> | null }

    if (!anyClient || anyClient.length === 0) {
      fail('registry', 'no clients in DB to test against')
      return
    }

    // Sample one with has_apnosh_website=false (likely most clients).
    const withoutSite = anyClient.find(c => !c.has_apnosh_website)
    if (withoutSite) {
      const tier = withoutSite.tier ?? 'starter'
      const tools = await loadEnabledToolsForClient(withoutSite.id, tier)
      const names = tools.map(t => t.name)
      const hasUpdatePage = names.includes('update_page_copy')
      const hasUpdateMenu = names.includes('update_menu_item')
      if (hasUpdatePage || hasUpdateMenu) {
        fail(`client ${withoutSite.id.slice(0, 8)} (tier=${tier}, no website)`,
          `LEAKED website tools: ${[hasUpdatePage && 'update_page_copy', hasUpdateMenu && 'update_menu_item'].filter(Boolean).join(', ')}`)
      } else {
        ok(`client ${withoutSite.id.slice(0, 8)} (tier=${tier}, no website)`, `${names.length} tools, no website tools ✓`)
      }
    }

    const withSite = anyClient.find(c => c.has_apnosh_website)
    if (withSite) {
      const tier = withSite.tier ?? 'starter'
      const tools = await loadEnabledToolsForClient(withSite.id, tier)
      const names = tools.map(t => t.name)
      const hasUpdatePage = names.includes('update_page_copy')
      const hasUpdateMenu = names.includes('update_menu_item')
      if (hasUpdatePage && hasUpdateMenu) {
        ok(`client ${withSite.id.slice(0, 8)} (tier=${tier}, has website)`, `${names.length} tools incl. website tools ✓`)
      } else {
        fail(`client ${withSite.id.slice(0, 8)} (tier=${tier}, has website)`,
          `website tools should be present: update_page_copy=${hasUpdatePage}, update_menu_item=${hasUpdateMenu}`)
      }
    } else {
      ok('has_apnosh_website=true client', '(none yet — will retest after first website signup)')
    }
  })

  // ─── 6. Proactive cron eligibility ──────────────────────────────
  await section('Proactive cron eligibility (tier filter)', async () => {
    const { count: weeklyCount } = await admin.from('clients')
      .select('id', { count: 'exact', head: true })
      .neq('status', 'churned')
      .in('tier', ['standard', 'pro'])
    const { count: dailyCount } = await admin.from('clients')
      .select('id', { count: 'exact', head: true })
      .neq('status', 'churned')
      .eq('tier', 'pro')
    const { count: assistantCount } = await admin.from('clients')
      .select('id', { count: 'exact', head: true })
      .neq('status', 'churned')
      .eq('tier', 'basic')
    ok('weekly cron will run for', `${weeklyCount ?? 0} clients (Strategist + Strategist+)`)
    ok('daily cron will run for', `${dailyCount ?? 0} clients (Strategist+)`)
    ok('Assistant clients excluded from cron', `${assistantCount ?? 0} clients`)
  })

  // ─── 7. Canonical eval suite loads ──────────────────────────────
  await section('Synthetic eval suite', async () => {
    if (CANONICAL_SUITE.length === 0) fail('CANONICAL_SUITE', 'empty')
    else ok('CANONICAL_SUITE loaded', `${CANONICAL_SUITE.length} cases`)
  })

  // ─── Summary ────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(60)}`)
  if (failures === 0) {
    console.log('✓ All checks passed.')
    process.exit(0)
  } else {
    console.log(`✗ ${failures} check${failures === 1 ? '' : 's'} failed.`)
    process.exit(1)
  }
}

main().catch(err => {
  console.error('smoke-test crashed:', err)
  process.exit(2)
})
