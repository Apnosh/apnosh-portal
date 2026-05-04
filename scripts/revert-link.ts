/**
 * Revert: remove the client_users row tying mjbutler.35@gmail.com to Do Si.
 * After this, mjbutler.35 is back to being a pure admin account with no
 * client portal access.
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

async function main() {
  const { data: rows } = await s
    .from('client_users')
    .select('id, email, role, status')
    .eq('client_id', DO_SI_ID)
  console.log('Before:', rows)

  const { error } = await s
    .from('client_users')
    .delete()
    .eq('client_id', DO_SI_ID)
    .ilike('email', 'mjbutler.35@gmail.com')
  if (error) {
    console.error(error.message)
    process.exit(1)
  }

  const { data: after } = await s
    .from('client_users')
    .select('id, email, role, status')
    .eq('client_id', DO_SI_ID)
  console.log('After:', after)
  console.log('\n✅ Reverted. mjbutler.35@gmail.com is back to admin-only.')
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
