/**
 * Replace the admin-account test linkage with a clean Gmail alias.
 * Removes mjbutler.35@gmail.com link, inserts mjbutler.35+dosi@gmail.com,
 * sends a magic link.
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

const DO_SI_ID = '2535fe50-0d78-411f-a59f-cfffbbd239b5'
const OLD_EMAIL = 'mjbutler.35@gmail.com'
const NEW_EMAIL = 'mjbutler.35+dosi@gmail.com'

async function main() {
  // 1. Delete the admin-tied client_user row
  const { error: delErr } = await s
    .from('client_users')
    .delete()
    .eq('client_id', DO_SI_ID)
    .ilike('email', OLD_EMAIL)
  if (delErr) {
    console.error('delete failed:', delErr.message)
    process.exit(1)
  }
  console.log(`✅ Removed ${OLD_EMAIL} link to Do Si`)

  // 2. Insert fresh row for the alias (status=invited, no auth_user_id yet)
  const { data: existing } = await s
    .from('client_users')
    .select('id')
    .eq('client_id', DO_SI_ID)
    .ilike('email', NEW_EMAIL)
    .maybeSingle()

  let clientUserId: string
  if (existing) {
    await s
      .from('client_users')
      .update({ name: 'Mark Butler (Do Si test)', role: 'owner', status: 'invited', auth_user_id: null })
      .eq('id', existing.id)
    clientUserId = existing.id
    console.log(`✅ Re-set existing ${NEW_EMAIL} row to invited`)
  } else {
    const { data, error } = await s
      .from('client_users')
      .insert({
        client_id: DO_SI_ID,
        email: NEW_EMAIL,
        name: 'Mark Butler (Do Si test)',
        role: 'owner',
        status: 'invited',
      })
      .select('id')
      .single()
    if (error) {
      console.error('insert failed:', error.message)
      process.exit(1)
    }
    clientUserId = data.id
    console.log(`✅ Inserted ${NEW_EMAIL} as invited client_user`)
  }

  // 3. Send the magic link
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  console.log(`\nSending magic link → ${NEW_EMAIL}`)
  console.log(`Redirect: ${appUrl}/auth/callback`)
  const { error: otpErr } = await s.auth.signInWithOtp({
    email: NEW_EMAIL,
    options: {
      emailRedirectTo: `${appUrl}/auth/callback`,
      shouldCreateUser: true,
    },
  })
  if (otpErr) {
    console.error('OTP send failed:', otpErr.message)
    process.exit(1)
  }
  console.log('✅ Magic link sent. Check your inbox at mjbutler.35@gmail.com (Gmail will route the +dosi alias here).')
  console.log(`\nclient_user id: ${clientUserId}`)
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
