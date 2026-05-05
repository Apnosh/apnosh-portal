import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { resolve } from 'path'
dotenv.config({ path: resolve(__dirname, '../.env.local') })
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })

async function main() {
  const { data, error } = await s
    .from('integrations')
    .select('provider, access_token, refresh_token, token_expires_at, metadata, updated_at')
    .eq('provider', 'google_drive')
    .maybeSingle()
  if (error) { console.error('error:', error.message); return }
  if (!data) { console.log('NO ROW for google_drive in integrations'); return }
  const expiresAt = data.token_expires_at ? new Date(data.token_expires_at) : null
  const now = new Date()
  console.log({
    provider: data.provider,
    has_access_token: !!data.access_token,
    has_refresh_token: !!data.refresh_token,
    token_expires_at: data.token_expires_at,
    expired: expiresAt ? expiresAt < now : 'unknown',
    minutes_to_expiry: expiresAt ? Math.round((expiresAt.getTime() - now.getTime()) / 60000) : null,
    email: (data.metadata as { email?: string })?.email ?? null,
    updated_at: data.updated_at,
  })

  // Check do si linked folders
  const { data: folders } = await s
    .from('client_drive_folders')
    .select('id, folder_id, label, sort_order, created_at')
    .eq('client_id', '2535fe50-0d78-411f-a59f-cfffbbd239b5')
    .order('sort_order')
  console.log('\nDo Si linked folders:', folders?.length ?? 0)
  for (const f of folders ?? []) {
    console.log('  ', f.label, '·', f.folder_id)
  }
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
