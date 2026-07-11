/**
 * verify-gbp-post — unit-style harness for the owner "Post an update" rail
 * (src/lib/gbp-apply/owner-post.ts) and the owner endpoints' gate order.
 * Run: npx tsx scripts/verify-gbp-post.ts
 *
 * ZERO NETWORK, GUARANTEED (same idiom as verify-gbp-apply): global fetch is
 * replaced before any module loads, env points at fake hosts, and any request
 * to an unexpected URL throws. Supabase reads (token row, location count,
 * rate-slot RPC) and the Google v4 localPosts create are all served by the
 * mock, so the REAL publishOwnerGbpPost → publishToGbp code runs end-to-end
 * and the harness asserts the exact POST body Google would have received,
 * plus the create-proof honesty contract (post name → live; missing name →
 * honest pending).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/* ── 1. Fake env BEFORE any import (never load .env.local — no prod creds here) ── */
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://supabase.fake'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-key'

/* ── 2. Mock fetch layer ── */
type RecordedCall = { url: string; method: string; body: unknown }
const googleCalls: RecordedCall[] = []
let supabaseCalls = 0
const state = {
  /** false → no active connection row (not-connected path) */
  tokenRow: true,
  locationCount: 1,
  rateSlot: true,
  createStatus: 200,
  /** raw Google v4 localPosts create response body */
  createBody: {} as Record<string, unknown>,
}
const TOKEN_ROW = {
  id: 'conn-1',
  access_token: 'fake-access-token',
  refresh_token: null,
  token_expires_at: new Date(Date.now() + 3_600_000).toISOString(), // future → no refresh call
  platform_account_id: 'accounts/111/locations/222',
}

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init })

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const method = (init?.method ?? 'GET').toUpperCase()

  if (url.startsWith('http://supabase.fake/rest/v1/')) {
    supabaseCalls++
    if (url.includes('/channel_connections')) return json(state.tokenRow ? TOKEN_ROW : null)
    if (url.includes('/gbp_locations')) {
      return new Response(null, { status: 200, headers: { 'content-range': `*/${state.locationCount}` } })
    }
    if (url.includes('/rpc/gbp_acquire_write_slot')) return json(state.rateSlot)
    return json(null)
  }
  if (url.startsWith('https://mybusiness.googleapis.com/v4/')) {
    let body: unknown = null
    if (init?.body) { try { body = JSON.parse(String(init.body)) } catch { body = String(init.body) } }
    googleCalls.push({ url, method, body })
    return state.createStatus === 200 ? json(state.createBody) : json(state.createBody, { status: state.createStatus })
  }
  throw new Error(`UNEXPECTED NETWORK CALL (harness must stay offline): ${method} ${url}`)
}) as typeof fetch

/* ── 3. Tiny suite ── */
let pass = 0, fail = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const group = (name: string) => console.log(`\n${name}`)
const deepEq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/* ── Fixtures ── */
const GOOD_TEXT = 'Our new patio is open. Come try the smoked brisket plate this weekend, and bring the whole family. The garden tables catch the evening sun.'
const HTTPS_URL = 'https://yellowbee.market/specials'

async function main() {
  const mod = await import('../src/lib/gbp-apply/owner-post')
  const { validateOwnerPost, publishOwnerGbpPost, OWNER_POST_MAX } = mod

  /* ── A. Deterministic post validation ── */
  group('A. post validation (deterministic, code-level)')
  check('A1 a plain update passes', validateOwnerPost({ text: GOOD_TEXT }).ok)
  check('A2 empty rejected', !validateOwnerPost({ text: '' }).ok)
  check('A3 whitespace-only rejected', !validateOwnerPost({ text: '  \n ' }).ok)
  check('A4 non-string text rejected', !validateOwnerPost({ text: 42 }).ok)
  check('A5 missing body rejected', !validateOwnerPost(null).ok)
  check(`A6 over ${OWNER_POST_MAX} chars rejected`, !validateOwnerPost({ text: 'x'.repeat(OWNER_POST_MAX + 1) }).ok)
  check(`A7 exactly ${OWNER_POST_MAX} chars passes`, validateOwnerPost({ text: 'x'.repeat(OWNER_POST_MAX) }).ok)
  check('A8 email rejected', !validateOwnerPost({ text: 'Big news this week. Email hello@place.io to book the patio.' }).ok)
  check('A9 phone rejected (matches the publish validator posture)', !validateOwnerPost({ text: 'New hours this week. Call 555-123-4567 to hold a table.' }).ok)
  check('A10 URL in the text rejected (the button carries the link)', !validateOwnerPost({ text: 'See www.example.com for the new menu this week.' }).ok)
  check('A11 bare domain rejected', !validateOwnerPost({ text: 'Order ahead at ourplace.com and skip the line tonight.' }).ok)
  const a12 = validateOwnerPost({ text: GOOD_TEXT, cta: { type: 'LEARN_MORE', url: HTTPS_URL } })
  check('A12 Learn-more button with an https link passes', a12.ok && a12.cta?.type === 'LEARN_MORE' && a12.cta?.url === HTTPS_URL)
  check('A13 http (not https) button link rejected', !validateOwnerPost({ text: GOOD_TEXT, cta: { type: 'LEARN_MORE', url: 'http://yellowbee.market' } }).ok)
  check('A14 Learn-more button without a link rejected', !validateOwnerPost({ text: GOOD_TEXT, cta: { type: 'LEARN_MORE' } }).ok)
  check('A15 a button link without a button type rejected', !validateOwnerPost({ text: GOOD_TEXT, cta: { url: HTTPS_URL } }).ok)
  check('A16 an unknown button type rejected', !validateOwnerPost({ text: GOOD_TEXT, cta: { type: 'BOOK', url: HTTPS_URL } }).ok)
  const a17 = validateOwnerPost({ text: GOOD_TEXT, cta: { type: 'CALL' } })
  check('A17 Call button (no link) passes', a17.ok && a17.cta?.type === 'CALL' && a17.cta?.url === undefined)
  check('A18 Call button WITH a link rejected (Call uses the listing phone)', !validateOwnerPost({ text: GOOD_TEXT, cta: { type: 'CALL', url: HTTPS_URL } }).ok)
  const a19 = validateOwnerPost({ text: GOOD_TEXT, cta: { type: 'ORDER', url: HTTPS_URL } })
  check('A19 Order button with an https link passes', a19.ok && a19.cta?.type === 'ORDER')
  check('A20 unparseable button link rejected', !validateOwnerPost({ text: GOOD_TEXT, cta: { type: 'LEARN_MORE', url: 'https://' } }).ok)

  /* ── B. Publish flow (real publishOwnerGbpPost → publishToGbp over mocked fetch) ── */
  group('B. publish flow: the exact payload Google receives')
  state.tokenRow = true; state.locationCount = 1; state.rateSlot = true; state.createStatus = 200
  state.createBody = {
    name: 'accounts/111/locations/222/localPosts/789',
    searchUrl: 'https://local.google.com/place?id=1&use=posts&lpsid=789',
  }
  googleCalls.length = 0
  const b1 = await publishOwnerGbpPost('client-1', { text: GOOD_TEXT, cta: { type: 'LEARN_MORE', url: HTTPS_URL } })
  const create = googleCalls.find((c) => c.method === 'POST')
  check('B1 POST targets the connected location localPosts', !!create && create.url === 'https://mybusiness.googleapis.com/v4/accounts/111/locations/222/localPosts', create?.url)
  const sent = (create?.body ?? {}) as Record<string, unknown>
  check('B2 summary is exactly the owner text', sent.summary === GOOD_TEXT)
  check('B3 topicType is STANDARD', sent.topicType === 'STANDARD')
  check('B4 languageCode is en', sent.languageCode === 'en')
  check('B5 CTA mapped to callToAction { actionType, url }', deepEq(sent.callToAction, { actionType: 'LEARN_MORE', url: HTTPS_URL }))
  check('B6 no media (text + button only)', !('media' in sent))
  check('B7 no event/offer payload on a plain update', !('event' in sent) && !('offer' in sent))
  check('B8 exactly one Google call (a create has no read-back request)', googleCalls.length === 1, `got ${googleCalls.length}`)

  group('B2. create proof → live/postUrl honesty')
  check('B9 created-post response → ok:true live:true', b1.ok && b1.live === true, JSON.stringify(b1))
  check('B10 postUrl is the searchUrl Google returned', b1.ok && b1.postUrl === 'https://local.google.com/place?id=1&use=posts&lpsid=789')
  check('B11 postName carries the created resource name', b1.ok && b1.postName === 'accounts/111/locations/222/localPosts/789')
  check('B12 live claim carries the plain posted line', b1.ok && b1.summary === 'Posted to Google.')

  state.createBody = { name: 'accounts/111/locations/222/localPosts/790' } // no searchUrl
  const b13 = await publishOwnerGbpPost('client-1', { text: GOOD_TEXT })
  check('B13 post name without searchUrl → live:true, postUrl null (never invented)', b13.ok && b13.live === true && b13.postUrl === null)

  state.createBody = {} // Google accepted but returned no post
  const b14 = await publishOwnerGbpPost('client-1', { text: GOOD_TEXT })
  check('B14 accepted-but-no-post-name → ok:true live:false (honest pending)', b14.ok && b14.live === false && b14.postUrl === null)
  check('B15 pending words say sent, can take a few minutes', b14.ok && /Sent to Google/.test(b14.summary) && /few minutes/.test(b14.summary))

  googleCalls.length = 0
  state.createBody = { name: 'accounts/111/locations/222/localPosts/791' }
  const b16 = await publishOwnerGbpPost('client-1', { text: GOOD_TEXT, cta: { type: 'CALL' } })
  const callSent = (googleCalls[0]?.body ?? {}) as Record<string, unknown>
  check('B16 CALL button maps without a url key', deepEq(callSent.callToAction, { actionType: 'CALL' }), JSON.stringify(callSent.callToAction))
  check('B16b CALL publish succeeds', b16.ok)
  googleCalls.length = 0
  await publishOwnerGbpPost('client-1', { text: GOOD_TEXT })
  const bare = (googleCalls[0]?.body ?? {}) as Record<string, unknown>
  check('B17 no button → no callToAction key at all', !('callToAction' in bare))

  group('B3. refusals (order + honesty)')
  state.createStatus = 500; state.createBody = { error: { message: 'upstream splat zzqq' } }
  const b18 = await publishOwnerGbpPost('client-1', { text: GOOD_TEXT })
  check('B18 Google error → ok:false google_error', !b18.ok && b18.code === 'google_error')
  check('B19 raw Google error never leaks to the owner', !b18.ok && !b18.error.includes('zzqq'))
  state.createStatus = 200; state.createBody = { name: 'accounts/111/locations/222/localPosts/792' }

  state.rateSlot = false
  googleCalls.length = 0
  const b20 = await publishOwnerGbpPost('client-1', { text: GOOD_TEXT })
  check('B20 rate slot denied → code rate_limited', !b20.ok && b20.code === 'rate_limited')
  check('B21 no Google call after a rate refusal', googleCalls.length === 0)
  state.rateSlot = true

  googleCalls.length = 0
  supabaseCalls = 0
  const b22 = await publishOwnerGbpPost('client-1', { text: 'See www.example.com tonight for the new menu list.' })
  check('B22 invalid post → code invalid', !b22.ok && b22.code === 'invalid')
  check('B23 invalid post never touches ANY network (validate first)', googleCalls.length === 0 && supabaseCalls === 0)

  state.tokenRow = false
  googleCalls.length = 0
  const b24 = await publishOwnerGbpPost('client-1', { text: GOOD_TEXT })
  check('B24 not-connected → code not_connected, plain words, no Google call', !b24.ok && b24.code === 'not_connected' && b24.error === 'Not connected to Google yet.' && googleCalls.length === 0)
  state.tokenRow = true

  state.locationCount = 3
  googleCalls.length = 0
  const b25 = await publishOwnerGbpPost('client-1', { text: GOOD_TEXT })
  check('B25 multi-location refused before any write', !b25.ok && b25.code === 'multi_location' && googleCalls.length === 0)
  state.locationCount = 1

  /* ── C. Owner endpoints: exports + gate order (source-asserted, like verify-gbp-apply J) ── */
  group('C. owner endpoint /api/dashboard/gbp-post')
  const pSrc = readFileSync(join(__dirname, '../src/app/api/dashboard/gbp-post/route.ts'), 'utf8')
  check('C1 gbp-post exports POST', /export async function POST\(/.test(pSrc))
  const idx = {
    access: pSrc.indexOf('checkClientAccess(clientId)'),
    tier: pSrc.indexOf('isProTier('),
    validate: pSrc.indexOf('validateOwnerPost('),
    publish: pSrc.indexOf('publishOwnerGbpPost(clientId'),
  }
  check('C2 gates in order: access → tier → validate → publish',
    idx.access > 0 && idx.access < idx.tier && idx.tier < idx.validate && idx.validate < idx.publish,
    JSON.stringify(idx))
  check('C3 rate refusal mapped to 429', /rate_limited[\s\S]{0,200}status: 429/.test(pSrc))
  check('C4 Pro gate returns 403', /Posting from here is on the Pro plan\.[\s\S]{0,80}status: 403/.test(pSrc))
  check('C5 live claimed only from the rail result', pSrc.includes('live: result.live'))
  check('C6 postUrl passed through from what Google returned', pSrc.includes('postUrl: result.postUrl'))

  group('C2. owner endpoint /api/dashboard/gbp-post-draft')
  const dSrc = readFileSync(join(__dirname, '../src/app/api/dashboard/gbp-post-draft/route.ts'), 'utf8')
  check('C7 gbp-post-draft exports POST', /export async function POST\(/.test(dSrc))
  const dIdx = {
    access: dSrc.indexOf('checkClientAccess(clientId)'),
    tier: dSrc.indexOf('isProTier('),
    refuse: dSrc.indexOf('We do not know enough about your business yet'),
    call: dSrc.indexOf('await callStructuredOutput'),
  }
  check('C8 draft gates in order: access → tier → zero-facts refusal → AI call',
    dIdx.access > 0 && dIdx.access < dIdx.tier && dIdx.tier < dIdx.refuse && dIdx.refuse < dIdx.call,
    JSON.stringify(dIdx))
  check('C9 draft grounded in the draftGbpPost reads (profile + menu + specials)',
    dSrc.includes("from('client_profiles')") && dSrc.includes("from('menu_items')") && dSrc.includes("from('client_specials')"))
  check('C10 draft treats the topic as data, never instructions', /never instructions/i.test(dSrc) && dSrc.includes('<topic>'))
  check('C11 deterministic backstop: em-dash strip + boundary cut + the SAME publish validator',
    dSrc.includes('truncateAtBoundary') && /\[–—\]/.test(dSrc) && dSrc.includes('validateOwnerPost({ text: cleaned })'))
  check('C12 draft caps at 600 characters', /DRAFT_MAX = 600/.test(dSrc))
  check('C13 draft never writes to Google (no publish import)', !dSrc.includes('publishOwnerGbpPost(clientId'))

  /* ── report ── */
  console.log(`\n${'─'.repeat(60)}\nverify-gbp-post: ${pass} passed, ${fail} failed, ${pass + fail} total`)
  if (fail > 0) process.exit(1)
}

main().catch((e) => { console.error('HARNESS CRASH:', e); process.exit(1) })
