import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { resolve } from 'path'
dotenv.config({ path: resolve(__dirname, '../.env.local') })
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })

async function main() {
  const { data: row } = await s.from('integrations').select('access_token').eq('provider', 'google_drive').single()
  const token = row?.access_token as string

  // Test each Do Si folder
  const folders = [
    { id: '1DJcAEBxHMBjlUfBjKP2', label: 'Content delivery' },
    { id: '1CSfnfoqAKJRuRQpc8AH', label: 'Strategy & onboarding' },
    { id: '16C35KkonXHWGbYrdef9', label: 'Food photography' },
    { id: '1gSLGdmf9lozTQPbmhKs', label: 'Alki location assets' },
  ]

  for (const f of folders) {
    console.log(`\n=== ${f.label} (id=${f.id}, len=${f.id.length}) ===`)
    // Probe metadata
    const metaRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${f.id}?fields=id,name,mimeType`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    const meta = await metaRes.json()
    console.log('  metadata:', metaRes.status, JSON.stringify(meta).slice(0, 200))
  }

  // Also list root to verify auth works
  console.log('\n=== Listing first 5 files in root ===')
  const rootRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?pageSize=5&fields=files(id,name,mimeType)`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  const root = await rootRes.json()
  console.log('  status:', rootRes.status)
  for (const f of root.files ?? []) {
    console.log(`    ${f.id} (${f.id.length} chars) - ${f.name} - ${f.mimeType}`)
  }
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
