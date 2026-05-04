import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { resolve } from 'path'
dotenv.config({ path: resolve(__dirname, '../.env.local') })
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })

async function main() {
  const { data } = await s.from('profiles').select('id, email, role, full_name').eq('id', '1ad93515-1c01-4c87-8224-67e89da82d46').maybeSingle()
  console.log('mjbutler.35 profile:', data)
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
