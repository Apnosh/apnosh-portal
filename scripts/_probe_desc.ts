import { config } from 'dotenv'
config({ path: '/Users/mjbutler35/Documents/GitHub/apnosh-portal/.env.local' })
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
const HOST = 'https://portal.apnosh.com'
;(async () => {
  const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const admin = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const jar: Record<string, string> = {}
  const ssr = createServerClient(URL_, ANON, { cookies: { getAll: () => Object.entries(jar).map(([name, value]) => ({ name, value })), setAll: (l) => { for (const { name, value } of l) jar[name] = value } } })
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email: 'admin@apnosh.com' })
  await ssr.auth.verifyOtp({ token_hash: link!.properties!.hashed_token, type: 'magiclink' })
  const { data: c } = await admin.from('clients').select('id').eq('name', 'Apnosh').maybeSingle()
  const cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ')
  for (const path of process.argv.slice(2)) {
    const r = await fetch(`${HOST}/api/dashboard/social-comments?clientId=${c!.id}&describe=${encodeURIComponent(path)}`, { headers: { cookie } })
    console.log('===', path, r.status)
    console.log(JSON.stringify(await r.json()).slice(0, 2600))
  }
})()
