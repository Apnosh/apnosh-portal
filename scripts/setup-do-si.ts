/**
 * Phase 1 of Do Si pilot setup:
 *   1. Update services_active to canonical names that unlock the right
 *      sidebar gates (social, website, local_seo) — everything except
 *      email_sms, plus the decorative service-contract entries.
 *   2. Insert client_locations rows for Alki Beach + Kent.
 *
 * Idempotent: re-running won't duplicate locations.
 *
 * Run: npx tsx scripts/setup-do-si.ts
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

const DO_SI_ID = '2535fe50-0d78-411f-a59f-cfffbbd239b5'

const SERVICES_ACTIVE = [
  'Social Media',
  'Website',
  'Local SEO',
  'Content',
  'Brand',
  'SEO',
  'Paid Ads',
  'Photography',
  'Video',
  'Strategy',
  'GBP Management',
]

const LOCATIONS = [
  {
    client_id: DO_SI_ID,
    location_name: 'Alki Beach',
    street: '2516 Alki Ave SW',
    full_address: '2516 Alki Ave SW, Seattle, WA 98116',
    city: 'Seattle',
    state: 'WA',
    zip: '98116',
    country: 'US',
    is_primary: true,
    is_active: true,
  },
  {
    client_id: DO_SI_ID,
    location_name: 'Kent',
    street: '25600 104th Ave SE',
    full_address: '25600 104th Ave SE, Kent, WA 98030',
    city: 'Kent',
    state: 'WA',
    zip: '98030',
    country: 'US',
    is_primary: false,
    is_active: true,
  },
]

async function main() {
  console.log('--- Updating services_active ---')
  const { error: svcErr } = await s
    .from('clients')
    .update({ services_active: SERVICES_ACTIVE })
    .eq('id', DO_SI_ID)
  if (svcErr) {
    console.error('services_active update failed:', svcErr.message)
    process.exit(1)
  }
  console.log('  ✅', SERVICES_ACTIVE.length, 'services set')

  console.log('\n--- Probing client_locations schema ---')
  const { data: existing, error: existErr } = await s
    .from('client_locations')
    .select('*')
    .eq('client_id', DO_SI_ID)
  if (existErr) {
    console.error('locations probe failed:', existErr.message)
    process.exit(1)
  }
  console.log('  existing count:', existing?.length ?? 0)
  if (existing && existing.length > 0) {
    console.log('  sample columns:', Object.keys(existing[0]).join(', '))
  }

  console.log('\n--- Inserting locations ---')
  for (const loc of LOCATIONS) {
    const found = (existing ?? []).find(
      (e: Record<string, unknown>) => e.location_name === loc.location_name,
    )
    if (found) {
      console.log(`  • ${loc.location_name} already exists, skipping`)
      continue
    }
    const { error } = await s.from('client_locations').insert(loc)
    if (error) {
      console.error(`  ❌ ${loc.location_name} insert failed:`, error.message)
    } else {
      console.log(`  ✅ ${loc.location_name} inserted`)
    }
  }

  console.log('\n--- Verification ---')
  const { data: verify } = await s
    .from('clients')
    .select('id, name, services_active')
    .eq('id', DO_SI_ID)
    .single()
  console.log('  services_active:', JSON.stringify(verify?.services_active))

  const { data: locs } = await s
    .from('client_locations')
    .select('location_name, street, city, state, is_primary')
    .eq('client_id', DO_SI_ID)
  console.log('  locations:')
  for (const l of locs ?? []) {
    console.log(`    • ${l.location_name} — ${l.street}, ${l.city}, ${l.state}${l.is_primary ? ' (primary)' : ''}`)
  }
}

main().then(() => process.exit(0)).catch(e => {
  console.error(e)
  process.exit(1)
})
