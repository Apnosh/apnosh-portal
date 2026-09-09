import { config } from 'dotenv'
config({ path: '/Users/mjbutler35/Documents/GitHub/apnosh-portal/.env.local' })
async function main() {
  const { createClient } = await import('@supabase/supabase-js')
  const { createServerClient } = await import('@supabase/ssr')
  const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const admin = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: link, error: le } = await admin.auth.admin.generateLink({ type: 'magiclink', email: 'admin@apnosh.com' })
  if (le || !link) throw new Error('link: ' + le?.message)
  const js = createClient(URL_, ANON)
  const { data: v, error: ve } = await js.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' })
  if (ve || !v.session) throw new Error('verify: ' + ve?.message)
  const jar: Record<string, string> = {}
  const ssr = createServerClient(URL_, ANON, { cookies: { getAll: () => Object.entries(jar).map(([name, value]) => ({ name, value })), setAll: (l) => { for (const { name, value } of l) jar[name] = value } } })
  await ssr.auth.setSession({ access_token: v.session.access_token, refresh_token: v.session.refresh_token })
  const cookie = Object.entries(jar).map(([k, val]) => `${k}=${val}`).join('; ')
  const base = 'https://portal.apnosh.com/api/dashboard/social-comments?clientId=b7a35925-2f51-4879-a756-26a73ff4e7a6'
  for (const mode of ['raw', '1']) {
    const r = await fetch(`${base}&diagnose=${mode}`, { headers: { cookie } })
    const t = await r.text()
    console.log(`\n=== diagnose=${mode} -> HTTP ${r.status}`)
    console.log(t.slice(0, 1800))
  }
}
main().then(() => process.exit(0)).catch(e => { console.error(e?.message ?? e); process.exit(1) })
