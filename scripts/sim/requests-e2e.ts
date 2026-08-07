/**
 * FULL over-the-wire E2E for the Request Desk — npx tsx --tsconfig scripts/sim/tsconfig.json scripts/sim/requests-e2e.ts
 *
 * Proves the WHOLE pipeline against the running dev server + real database:
 *   seed throwaway owner -> sign in (real ssr cookie, http-e2e house pattern) ->
 *   401s for strangers -> 400 for garbage -> authed POST lands the row ->
 *   staff got the inbox notification -> authed GET lists it -> owner cannot PATCH (403) ->
 *   the team answers (exact handler semantics: status+note+notifyClientOwners) ->
 *   owner notification carries the note -> authed GET shows quoted + note ->
 *   teardown deletes EVERYTHING it created (request, notifications, login).
 *
 * Self-cleaning and marker-scoped: every created artifact carries E2E_PROBE_DELETE_ME
 * or hangs off the throwaway user, so a crashed run can be swept by re-running.
 */
import { config } from 'dotenv'
import { createClient as createJsClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { randomBytes } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { STATUS_LABEL, requestTypeById } from '@/lib/requests/catalog'
import { notifyClientOwners } from '@/lib/notifications'
import { Suite } from './lib'

config({ path: '.env.local' })

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const TEST_CLIENT = '2535fe50-0d78-411f-a59f-cfffbbd239b5'
const EMAIL = 'owner.e2e@apnosh-test.com'
const MARK = 'E2E_PROBE_DELETE_ME'
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

async function mintCookie(password: string): Promise<string | null> {
  const js = createJsClient(URL_, ANON)
  const { data, error } = await js.auth.signInWithPassword({ email: EMAIL, password })
  if (error || !data.session) { console.error('sign-in failed:', error?.message); return null }
  const jar: Record<string, string> = {}
  const ssr = createServerClient(URL_, ANON, {
    cookies: {
      getAll: () => Object.entries(jar).map(([name, value]) => ({ name, value })),
      setAll: (list) => { for (const { name, value } of list) jar[name] = value },
    },
  })
  await ssr.auth.setSession({ access_token: data.session.access_token, refresh_token: data.session.refresh_token })
  return Object.entries(jar).map(([n, v]) => `${n}=${v}`).join('; ')
}

async function main() {
  const s = new Suite()
  const a = createAdminClient()

  const up = await fetch(`${BASE}/login`).then((r) => r.ok).catch(() => false)
  if (!up) { console.error(`Dev server not reachable at ${BASE}.`); process.exit(1) }

  // ── sweep any leftovers from a crashed prior run, then seed the throwaway owner ──
  const { data: priorUsers } = await a.auth.admin.listUsers()
  for (const u of priorUsers?.users ?? []) {
    if (u.email === EMAIL) {
      await a.from('client_users').delete().eq('auth_user_id', u.id)
      await a.from('notifications').delete().eq('user_id', u.id)
      await a.auth.admin.deleteUser(u.id)
    }
  }
  await a.from('creative_requests').delete().eq('client_id', TEST_CLIENT).ilike('brief->>what', `%${MARK}%`)
  await a.from('notifications').delete().ilike('title', `%${MARK}%`)

  const password = randomBytes(18).toString('base64url')
  const { data: created, error: createErr } = await a.auth.admin.createUser({
    email: EMAIL, password, email_confirm: true,
  })
  s.group('Seed: throwaway owner attached to the test client')
  s.check('auth user created', !createErr && Boolean(created?.user?.id), createErr?.message)
  const userId = created?.user?.id
  if (!userId) { s.report('Request Desk wire E2E'); process.exit(1) }
  const { error: cuErr } = await a.from('client_users').insert({
    client_id: TEST_CLIENT, auth_user_id: userId, email: EMAIL,
  })
  s.check('client_users row links the owner to the client', !cuErr, cuErr?.message)

  const cookie = await mintCookie(password)
  s.check('real ssr session cookie minted via sign-in', Boolean(cookie))

  const teardown = async () => {
    await a.from('creative_requests').delete().eq('client_id', TEST_CLIENT).ilike('brief->>what', `%${MARK}%`)
    await a.from('notifications').delete().ilike('title', `%${MARK}%`)
    await a.from('notifications').delete().eq('user_id', userId)
    await a.from('client_users').delete().eq('auth_user_id', userId)
    await a.auth.admin.deleteUser(userId)
  }
  if (!cookie) { await teardown(); s.report('Request Desk wire E2E'); process.exit(1) }

  try {
    // ── strangers are turned away ──────────────────────────────────────────
    s.group('Wire: auth gates')
    const anonPost = await fetch(`${BASE}/api/requests`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'other', answers: { what: 'x', when: 'No rush' } }),
    })
    s.check('signed-out POST is 401', anonPost.status === 401)

    // ── garbage is refused, honesty is accepted ────────────────────────────
    s.group('Wire: owner submits through the real route')
    const bad = await fetch(`${BASE}/api/requests`, {
      method: 'POST', headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ type: 'video', answers: { what: 'x', filming: 'Send a drone', count: 'Just 1', when: 'No rush' } }),
    })
    s.check('an answer outside the choices is 400', bad.status === 400)

    const post = await fetch(`${BASE}/api/requests`, {
      method: 'POST', headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ type: 'other', answers: { what: `${MARK} a window banner for our patio opening`, when: 'In 2 weeks' } }),
    })
    const postBody = (await post.json().catch(() => ({}))) as { request?: { id?: string; status?: string } }
    s.check('a valid request is accepted (200)', post.status === 200, `status ${post.status}`)
    const reqId = postBody.request?.id
    s.check('the row lands as requested', postBody.request?.status === 'requested' && Boolean(reqId))

    const { data: staffNotifs } = await a.from('notifications').select('id, user_id, type, link').ilike('title', `%${MARK}%`)
    s.check('staff got the inbox notification (client_request -> /admin/requests)',
      (staffNotifs ?? []).length > 0 && (staffNotifs ?? []).every((n) => n.type === 'client_request' && n.link === '/admin/requests'))

    const list = await fetch(`${BASE}/api/requests`, { headers: { cookie } })
    const listBody = (await list.json().catch(() => ({}))) as { requests?: Array<{ id: string; status: string }> }
    s.check('authed GET lists the new request', (listBody.requests ?? []).some((r) => r.id === reqId))

    // ── the admin gate holds against a mere owner ──────────────────────────
    s.group('Wire: the admin gate')
    const ownerPatch = await fetch(`${BASE}/api/requests/${reqId}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ status: 'quoted', team_note: 'sneaky' }),
    })
    s.check('an owner cannot PATCH (403, admins only)', ownerPatch.status === 403)

    // ── the team answers (exact PATCH-handler semantics, service role) ─────
    s.group('Team answers: quote + owner notification')
    const NOTE = `${MARK} We can do this for $180, delivered in 5 days. Reply yes and we start.`
    const { data: updated, error: updErr } = await a
      .from('creative_requests')
      .update({ status: 'quoted', team_note: NOTE, updated_at: new Date().toISOString() })
      .eq('id', reqId!)
      .select('id, client_id, type, status, team_note')
      .single()
    s.check('status moves to quoted with the note', !updErr && updated?.status === 'quoted', updErr?.message)
    if (updated) {
      const type = requestTypeById(updated.type)
      await notifyClientOwners(updated.client_id, {
        kind: 'request_update',
        title: `${type?.label ?? 'Your request'}: ${STATUS_LABEL.quoted}`,
        body: String(updated.team_note).slice(0, 300),
        link: '/dashboard/requests',
      })
    }
    const { data: ownerNotifs } = await a
      .from('notifications').select('id, type, title, body').eq('user_id', userId).eq('type', 'request_update')
    s.check('the owner notification exists and carries the quote',
      (ownerNotifs ?? []).length > 0 && (ownerNotifs ?? [])[0].body?.includes('$180') === true)

    const list2 = await fetch(`${BASE}/api/requests`, { headers: { cookie } })
    const list2Body = (await list2.json().catch(() => ({}))) as { requests?: Array<{ id: string; status: string; team_note: string | null }> }
    const mine = (list2Body.requests ?? []).find((r) => r.id === reqId)
    s.check('the owner now sees quoted + the team note', mine?.status === 'quoted' && Boolean(mine?.team_note?.includes('$180')))
  } finally {
    // ── leave no trace ─────────────────────────────────────────────────────
    await teardown()
  }

  s.group('Teardown: no trace left')
  const { data: leftReq } = await a.from('creative_requests').select('id').eq('client_id', TEST_CLIENT).ilike('brief->>what', `%${MARK}%`)
  const { data: leftNotif } = await a.from('notifications').select('id').ilike('title', `%${MARK}%`)
  const { data: leftUsers } = await a.auth.admin.listUsers()
  s.check('probe request removed', (leftReq ?? []).length === 0)
  s.check('probe notifications removed', (leftNotif ?? []).length === 0)
  s.check('throwaway login deleted', !(leftUsers?.users ?? []).some((u) => u.email === EMAIL))

  const ok = s.report('Request Desk wire E2E (real routes, real DB)')
  process.exit(ok ? 0 : 1)
}
main()
