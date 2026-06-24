/**
 * Seed a real test-creator login so you can sign in AS a creator and receive
 * work orders end to end. Creates an auth user (you own this account) and maps
 * it to a seeded pool creator via creator_logins. Idempotent.
 *
 * Prereq: migration 173 applied. Run from the repo root:
 *   npx tsx scripts/sim/seed-test-creator.ts
 * Override defaults with env: SEED_CREATOR_EMAIL, SEED_CREATOR_PASSWORD, SEED_CREATOR_ID.
 */
import { config } from 'dotenv'
import { createAdminClient } from '@/lib/supabase/admin'

config({ path: '.env.local' })

const EMAIL = process.env.SEED_CREATOR_EMAIL || 'maya.creator@apnosh-test.com'
const PASSWORD = process.env.SEED_CREATOR_PASSWORD || 'TestCreator!2026'
const CREATOR_ID = process.env.SEED_CREATOR_ID || 'v_maya'

async function main() {
  const a = createAdminClient()

  // Create the auth user (handle_new_user auto-makes the profile). If it already
  // exists, find it so re-runs are idempotent.
  let userId: string | null = null
  const { data: created, error: cErr } = await a.auth.admin.createUser({
    email: EMAIL, password: PASSWORD, email_confirm: true,
    user_metadata: { full_name: 'Maya R. (test creator)' },
  })
  if (created?.user) {
    userId = created.user.id
  } else {
    const { data: list } = await a.auth.admin.listUsers()
    userId = list?.users.find((u) => u.email === EMAIL)?.id ?? null
    if (!userId) { console.error('could not create or find the user:', cErr?.message); process.exit(1) }
  }

  const { error: mErr } = await a.from('creator_logins').upsert({ person_id: userId, creator_id: CREATOR_ID }, { onConflict: 'person_id' })
  if (mErr) { console.error('mapping failed (is migration 173 applied?):', mErr.message); process.exit(1) }

  console.log('\n✅ Test creator ready')
  console.log('   email     :', EMAIL)
  console.log('   password  :', PASSWORD)
  console.log('   creator_id:', CREATOR_ID, `(${userId})`)
  console.log('\nSign in with these, then open /creator/work (no ?creator= needed).')
  console.log('Ship a campaign whose Video pick is this creator, and the orders land in their inbox.\n')
}

main().catch((e) => { console.error(e); process.exit(1) })
