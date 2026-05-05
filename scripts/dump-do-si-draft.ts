import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { resolve } from 'path'
dotenv.config({ path: resolve(__dirname, '../.env.local') })
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })

async function main() {
  const { data } = await s
    .from('site_configs')
    .select('draft_data')
    .eq('client_id', '2535fe50-0d78-411f-a59f-cfffbbd239b5')
    .single()
  console.log(JSON.stringify(data?.draft_data, null, 2))
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
