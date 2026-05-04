/**
 * Probe client_users for any rows with apnosh@gmail.com.
 * Same email registered to multiple clients breaks ClientProvider's
 * .maybeSingle() resolution.
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
  const { data, error } = await s
    .from('client_users')
    .select('id, client_id, email, name, role, status, auth_user_id, clients(name)')
  if (error) {
    console.error(error.message)
    process.exit(1)
  }
  console.log('All client_users:')
  for (const u of data ?? []) {
    const clients = (u as unknown as { clients?: { name?: string } | { name?: string }[] }).clients
    const clientName = Array.isArray(clients)
      ? clients[0]?.name ?? '?'
      : clients?.name ?? '?'
    console.log(`  ${u.email?.padEnd(32)} | client=${clientName.padEnd(28)} | role=${u.role} | status=${u.status} | auth=${u.auth_user_id ? 'linked' : '—'}`)
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
