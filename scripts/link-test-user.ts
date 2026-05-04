/**
 * Link mjbutler.35@gmail.com as a Do Si KBBQ client_user, with auth_user_id
 * pre-set so no magic-link round-trip is needed for testing.
 *
 * After this runs, visiting /dashboard while logged in as mjbutler.35@gmail.com
 * resolves clientId via the client_users fallback (since the existing Apnosh
 * businesses row has no client_id) and shows the Do Si dashboard.
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
const TEST_EMAIL = 'mjbutler.35@gmail.com'
const TEST_AUTH_USER_ID = '1ad93515-1c01-4c87-8224-67e89da82d46'

async function main() {
  // Ensure CRM profile exists
  const { ensureClientProfile } = await import('../src/lib/crm-sync')
  await ensureClientProfile(DO_SI_ID).catch(e => console.warn('crm-sync warn:', e?.message))

  const { data: existing } = await s
    .from('client_users')
    .select('id')
    .eq('client_id', DO_SI_ID)
    .ilike('email', TEST_EMAIL)
    .maybeSingle()

  if (existing) {
    const { error } = await s
      .from('client_users')
      .update({
        name: 'Mark Butler (test)',
        role: 'owner',
        status: 'active',
        auth_user_id: TEST_AUTH_USER_ID,
      })
      .eq('id', existing.id)
    if (error) {
      console.error('update failed:', error.message)
      process.exit(1)
    }
    console.log('✅ Updated existing client_user', existing.id)
  } else {
    const { data, error } = await s
      .from('client_users')
      .insert({
        client_id: DO_SI_ID,
        email: TEST_EMAIL,
        name: 'Mark Butler (test)',
        role: 'owner',
        status: 'active',
        auth_user_id: TEST_AUTH_USER_ID,
      })
      .select('id')
      .single()
    if (error) {
      console.error('insert failed:', error.message)
      process.exit(1)
    }
    console.log('✅ Inserted client_user', data.id)
  }

  console.log('\nVerification:')
  const { data: verify } = await s
    .from('client_users')
    .select('email, role, status, auth_user_id, clients(name)')
    .eq('client_id', DO_SI_ID)
  for (const u of verify ?? []) {
    console.log('  ', u)
  }

  console.log('\nNext: log in as', TEST_EMAIL, 'and visit /dashboard. You should see Do Si KBBQ.')
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
