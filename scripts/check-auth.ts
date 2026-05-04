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
  const { data: biz } = await s.from('businesses').select('id, name, owner_id, client_id').limit(30)
  console.log('businesses:')
  for (const b of biz ?? []) console.log(`  ${b.name?.padEnd(28)} | owner=${b.owner_id ?? '—'} | client=${b.client_id ?? '—'}`)
  const { data: users } = await s.auth.admin.listUsers()
  console.log('\nauth users:')
  for (const u of users.users ?? []) console.log(`  ${u.email?.padEnd(32)} | id=${u.id}`)
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
