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
  // Read both
  const a = await s.from('bespoke_sites').select('client_id').limit(1)
  console.log('bespoke_sites read:', a.error?.message || `ok (${a.data?.length} rows)`)

  const b = await s.from('bespoke_history').select('id').limit(1)
  console.log('bespoke_history read:', b.error?.message || `ok (${b.data?.length} rows)`)

  // Write probe to bespoke_history
  const probe = {
    client_id: '00000000-0000-0000-0000-000000000000',
    html_doc: 'probe',
    version: 0,
  }
  const c = await s.from('bespoke_history').insert(probe)
  console.log('bespoke_history insert:', c.error?.message || 'ok')
  if (!c.error) {
    await s.from('bespoke_history').delete().eq('client_id', '00000000-0000-0000-0000-000000000000')
  }

  // Write probe to bespoke_sites
  const d = await s.from('bespoke_sites').insert(probe)
  console.log('bespoke_sites insert:', d.error?.message || 'ok')
  if (!d.error) {
    await s.from('bespoke_sites').delete().eq('client_id', '00000000-0000-0000-0000-000000000000')
  }
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
