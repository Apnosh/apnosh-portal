/**
 * Over-the-wire HTTP e2e for the creator-side routes. Signs in as a seeded test
 * creator, mints a real @supabase/ssr session cookie (same library the app
 * uses, so the format matches), sets up orders via the service role, then hits
 * the ACTUAL running routes and asserts auth + the status-machine guard end to
 * end: the creator can act on their own order, the 409 transition guard fires,
 * a cross-tenant order is 403 (IDOR), a bad delivery link is 400, and no session
 * is 401.
 *
 * Prereqs (you run this — it needs your dev server + a seeded creator login):
 *   1. npx tsx scripts/sim/seed-test-creator.ts   (creates the creator account)
 *   2. npm run dev                                  (in another terminal)
 *   3. npx tsx scripts/sim/http-e2e.ts
 * Override: BASE_URL (default http://localhost:3000), SEED_CREATOR_EMAIL/PASSWORD.
 */
import { config } from 'dotenv'
import { createClient as createJsClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { createAdminClient } from '@/lib/supabase/admin'
import { Suite } from './lib'

config({ path: '.env.local' })

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
const EMAIL = process.env.SEED_CREATOR_EMAIL || 'maya.creator@apnosh-test.com'
const PASSWORD = process.env.SEED_CREATOR_PASSWORD || 'TestCreator!2026'
const TEST_CLIENT = '2535fe50-0d78-411f-a59f-cfffbbd239b5'
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/** Sign in + mint the cookie header @supabase/ssr will accept on the dev server. */
async function authCookieHeader(): Promise<{ cookie: string; userId: string } | null> {
  const js = createJsClient(URL, ANON)
  const { data, error } = await js.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
  if (error || !data.session) { console.error('sign-in failed:', error?.message); return null }

  const jar: Record<string, string> = {}
  const ssr = createServerClient(URL, ANON, {
    cookies: {
      getAll: () => Object.entries(jar).map(([name, value]) => ({ name, value })),
      setAll: (list) => { for (const { name, value } of list) jar[name] = value },
    },
  })
  await ssr.auth.setSession({ access_token: data.session.access_token, refresh_token: data.session.refresh_token })
  const cookie = Object.entries(jar).map(([n, v]) => `${n}=${v}`).join('; ')
  return { cookie, userId: data.session.user.id }
}

async function patch(orderId: string, body: Record<string, unknown>, cookie?: string): Promise<number> {
  const r = await fetch(`${BASE_URL}/api/creator/work`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify({ id: orderId, ...body }),
  })
  return r.status
}

async function main() {
  const s = new Suite()

  // reachability
  const reachable = await fetch(BASE_URL).then(() => true).catch(() => false)
  if (!reachable) { console.error(`\nDev server not reachable at ${BASE_URL}. Start it with: npm run dev\n`); process.exit(1) }

  const auth = await authCookieHeader()
  if (!auth) { console.error('Could not authenticate. Did you run seed-test-creator.ts?'); process.exit(1) }

  const admin = createAdminClient()
  const { data: login } = await admin.from('creator_logins').select('creator_id').eq('person_id', auth.userId).maybeSingle()
  const creatorId = login?.creator_id as string | undefined
  if (!creatorId) { console.error('That user has no creator_logins mapping. Run seed-test-creator.ts.'); process.exit(1) }

  // ── setup: a throwaway campaign + two orders (mine + someone else's) ──
  await admin.from('campaigns').delete().eq('name', 'HTTP_E2E_DELETE_ME')
  const { data: camp } = await admin.from('campaigns').insert({ client_id: TEST_CLIENT, name: 'HTTP_E2E_DELETE_ME', path: 'ai', status: 'shipped', phase: 'monitor' }).select('id').single()
  const campaignId = camp?.id as string
  const mk = async (creator: string, discipline: string) => {
    const { data } = await admin.from('creator_work_orders').insert({ campaign_id: campaignId, client_id: TEST_CLIENT, creator_id: creator, discipline, slot: 0, title: `http-e2e ${discipline}`, status: 'offered' }).select('id').single()
    return data?.id as string
  }
  const mine = await mk(creatorId, 'Video')
  const theirs = await mk('sim_http_other', 'Photo')

  try {
    // ── auth ────────────────────────────────────────────────────────────
    s.group('auth')
    const meAuthed = await fetch(`${BASE_URL}/api/creator/me`, { headers: { cookie: auth.cookie } })
    const meBody = await meAuthed.json().catch(() => ({}))
    s.check('GET /api/creator/me (signed in) → 200', meAuthed.status === 200, `status ${meAuthed.status}`)
    s.check('me returns my creator id + my order', meBody.creatorId === creatorId && (meBody.orders ?? []).some((o: { id: string }) => o.id === mine))
    s.check('PATCH with no session → 401', (await patch(mine, { status: 'accepted' })) === 401)

    // ── creator can act on their own order ───────────────────────────────
    s.group('own order')
    s.check('accept my order → 200', (await patch(mine, { status: 'accepted' }, auth.cookie)) === 200)
    s.check('start my order → 200', (await patch(mine, { status: 'in_progress' }, auth.cookie)) === 200)

    // ── status-machine guard (409) + url validation (400) ────────────────
    s.group('guards')
    s.check('deliver with no link → 409', (await patch(mine, { status: 'delivered' }, auth.cookie)) === 409)
    s.check('deliver with javascript: link → 400', (await patch(mine, { status: 'delivered', delivered_url: 'javascript:alert(1)' }, auth.cookie)) === 400)
    s.check('deliver with a real link → 200', (await patch(mine, { status: 'delivered', delivered_url: 'https://example.com/work.mp4' }, auth.cookie)) === 200)
    s.check('illegal jump delivered → in_progress → 409', (await patch(mine, { status: 'in_progress' }, auth.cookie)) === 409)

    // ── IDOR: cannot touch another creator's order ───────────────────────
    s.group('authz (IDOR)')
    s.check("PATCH another creator's order → 403", (await patch(theirs, { status: 'accepted' }, auth.cookie)) === 403)
  } finally {
    await admin.from('campaigns').delete().eq('id', campaignId)
  }

  const ok = s.report('HTTP e2e — creator routes over the wire')
  process.exit(ok ? 0 : 1)
}

main().catch((e) => { console.error('FAIL', e); process.exit(1) })
