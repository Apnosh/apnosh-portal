/**
 * Manually refresh the Drive access token. Prints the response from
 * Google so we can see WHY the silent refresh has been failing.
 */

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
  const { data } = await s
    .from('integrations')
    .select('refresh_token')
    .eq('provider', 'google_drive')
    .single()

  if (!data?.refresh_token) {
    console.log('No refresh_token stored.')
    return
  }

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    refresh_token: data.refresh_token as string,
    grant_type: 'refresh_token',
  })

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
  const json = await res.json()
  console.log('HTTP', res.status, res.statusText)
  console.log(JSON.stringify(json, null, 2))

  if (res.ok && json.access_token) {
    const newExpiresAt = new Date(Date.now() + (json.expires_in as number) * 1000).toISOString()
    const { error } = await s
      .from('integrations')
      .update({
        access_token: json.access_token,
        token_expires_at: newExpiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq('provider', 'google_drive')
    if (error) console.error('Update failed:', error.message)
    else console.log('\n✅ Token refreshed and saved. Expires at', newExpiresAt)
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
