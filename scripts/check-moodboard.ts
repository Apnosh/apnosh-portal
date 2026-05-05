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
  const r = await s.from('client_moodboard_items').select('id').limit(1)
  console.log('moodboard read:', r.error?.message || `ok (${r.data?.length ?? 0} rows)`)

  // Write probe — fake client_id will trip FK; that proves table + columns exist.
  const probe = {
    client_id: '00000000-0000-0000-0000-000000000000',
    url: 'https://example.com',
    title: 'probe',
    pinned: false,
  }
  const w = await s.from('client_moodboard_items').insert(probe)
  if (!w.error) {
    console.log('moodboard insert: ok (unexpected — cleaning up)')
    await s.from('client_moodboard_items').delete().eq('client_id', probe.client_id)
  } else if (/foreign key|violates/i.test(w.error.message)) {
    console.log('moodboard insert: FK error as expected → schema is correct ✓')
  } else {
    console.log('moodboard insert error:', w.error.message)
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
