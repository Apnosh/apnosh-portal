import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { resolve } from 'path'
dotenv.config({ path: resolve(__dirname, '../.env.local') })
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })

async function main() {
  const { data, error } = await s.from('site_configs').select('client_id, vertical, template_id, version, published_at, updated_at, clients(name, slug)').order('updated_at', { ascending: false })
  if (error) {
    console.log('❌ site_configs table missing — migration 079 not applied yet')
    console.log('   Error:', error.message)
    return
  }
  console.log('✅ site_configs exists. Rows:')
  for (const r of data ?? []) {
    const cli = (r as Record<string, unknown>).clients as { name?: string; slug?: string } | { name?: string; slug?: string }[] | null
    const c = Array.isArray(cli) ? cli[0] : cli
    console.log(`  ${(c?.name ?? '?').padEnd(28)} | slug=${c?.slug ?? '?'} | vertical=${r.vertical} | v${r.version} | published=${r.published_at ? 'yes' : 'no'}`)
  }
  if (!data?.length) console.log('  (no rows yet — run scripts/seed-do-si-site-config.ts)')
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
