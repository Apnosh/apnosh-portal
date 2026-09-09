/* Local-only, READ-ONLY: asks production what the composer loads, so the vendor's
   real shapes are checked rather than assumed. */
import { config } from 'dotenv'
config({ path: '/Users/mjbutler35/Documents/GitHub/apnosh-portal/.env.local' })
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'

const HOST = 'https://portal.apnosh.com'
;(async () => {
  const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const admin = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: link, error: le } = await admin.auth.admin.generateLink({ type: 'magiclink', email: 'admin@apnosh.com' })
  if (le) throw le
  const jar: Record<string, string> = {}
  const js = createClient(URL_, ANON)
  const { error: ve } = await js.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' })
  if (ve) throw ve
  const ssr = createServerClient(URL_, ANON, { cookies: { getAll: () => Object.entries(jar).map(([name, value]) => ({ name, value })), setAll: (l) => { for (const { name, value } of l) jar[name] = value } } })
  await ssr.auth.verifyOtp({ token_hash: (await admin.auth.admin.generateLink({ type: 'magiclink', email: 'admin@apnosh.com' })).data.properties!.hashed_token, type: 'magiclink' })

  const { data: c } = await admin.from('clients').select('id,name').eq('name', 'Apnosh').maybeSingle()
  console.log('client:', c?.name, c?.id)
  const cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ')
  const r = await fetch(`${HOST}/api/dashboard/social-publish?clientId=${c!.id}&tz=America/Los_Angeles`, { headers: { cookie } })
  const j = await r.json()
  console.log('status', r.status)
  console.log('limits:', JSON.stringify(j.limits))
  console.log('bests:', JSON.stringify(j.bests))
  console.log('targets:', JSON.stringify((j.targets ?? []).map((t: Record<string, unknown>) => ({ platform: t.platform, name: t.name, pageId: t.pageId }))))
})()
