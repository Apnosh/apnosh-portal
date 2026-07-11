/**
 * verify-gbp-qanda — unit-style harness for the GBP Questions & Answers rail
 * (src/lib/gbp-qanda.ts) and the owner endpoints' gate order.
 * Run: npx tsx scripts/verify-gbp-qanda.ts
 *
 * ZERO NETWORK, GUARANTEED (same idiom as verify-gbp-apply): global fetch is
 * replaced before any module loads, env points at fake hosts, and any request
 * to an unexpected URL throws. Supabase reads (token row, rate-slot RPC) and
 * the Q&A API calls (questions list GET + answers:upsert POST) are all served
 * by the mock, so the REAL listGbpQuestions/upsertGbpAnswer code runs
 * end-to-end and the harness asserts the exact POST body Google would have
 * received plus the read-back-proof honesty contract.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/* ── 1. Fake env BEFORE any import (never load .env.local — no prod creds here) ── */
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://supabase.fake'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-key'

/* ── 2. Mock fetch layer ── */
type RecordedCall = { url: string; method: string; body: unknown }
const googleCalls: RecordedCall[] = []
const state = {
  /** null → no active connection row (not-connected path) */
  tokenRow: true,
  rateSlot: true,
  listStatus: 200,
  listBody: {} as Record<string, unknown>,
  upsertStatus: 200,
  upsertBody: {} as Record<string, unknown>,
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
    if (url.includes('/channel_connections')) return json(state.tokenRow ? TOKEN_ROW : null)
    if (url.includes('/rpc/gbp_acquire_write_slot')) return json(state.rateSlot)
    return json(null)
  }
  if (url.startsWith('https://mybusinessqanda.googleapis.com/v1/')) {
    let body: unknown = null
    if (init?.body) { try { body = JSON.parse(String(init.body)) } catch { body = String(init.body) } }
    googleCalls.push({ url, method, body })
    if (method === 'POST') {
      return state.upsertStatus === 200 ? json({}) : json(state.upsertBody, { status: state.upsertStatus })
    }
    return state.listStatus === 200 ? json(state.listBody) : json(state.listBody, { status: state.listStatus })
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
const Q_LIST = {
  questions: [
    {
      name: 'locations/222/questions/q-answered',
      author: { displayName: 'Dana P', type: 'REGULAR_USER' },
      text: 'Do you have gluten free options?',
      upvoteCount: 3,
      createTime: '2026-06-20T12:00:00Z',
      topAnswers: [
        { author: { displayName: 'Yellow Bee Market', type: 'MERCHANT' }, text: 'Yes, we mark them on the menu.' },
        { author: { displayName: 'Some Guest', type: 'LOCAL_GUIDE' }, text: 'I think so.' },
      ],
    },
    {
      name: 'locations/222/questions/q-open',
      author: { displayName: '', type: 'REGULAR_USER' },
      text: 'Is there parking nearby?',
      createTime: '2026-07-01T12:00:00Z',
      topAnswers: [
        { author: { displayName: 'Larry Local', type: 'LOCAL_GUIDE' }, text: 'Street parking around the corner.' },
      ],
    },
    // Malformed rows the normalizer must drop, never crash on:
    { name: 'bogus-shape-no-question-segment', text: 'no id here' },
    { name: 'locations/222/questions/q-blank', text: '   ' },
  ],
}

const DISABLED_403 = {
  error: {
    code: 403,
    message: 'My Business Q&A API has not been used in project 922204404585 before or it is disabled. Enable it by visiting https://console.developers.google.com/apis/api/mybusinessqanda.googleapis.com/overview then retry.',
    status: 'PERMISSION_DENIED',
    details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'SERVICE_DISABLED' }],
  },
}

const GOOD_ANSWER = 'Yes, we have a lot next to the shop and street spots out front. Weekends fill up by noon, so coming early helps.'

async function main() {
  const qanda = await import('../src/lib/gbp-qanda')
  const { listGbpQuestions, upsertGbpAnswer, validateAnswer, validQuestionId } = qanda

  /* ── A. List normalization ── */
  group('A. list normalization (real listGbpQuestions over mocked fetch)')
  state.tokenRow = true; state.listStatus = 200; state.listBody = Q_LIST
  googleCalls.length = 0
  const a = await listGbpQuestions('client-1')
  check('A1 read succeeds', a.ok)
  if (!a.ok) throw new Error('A-block needs a successful read')
  check('A2 malformed rows dropped (2 of 4 survive)', a.questions.length === 2, `got ${a.questions.length}`)
  const answered = a.questions.find((q) => q.id === 'q-answered')
  const open = a.questions.find((q) => q.id === 'q-open')
  check('A3 id normalized to the stable last segment', !!answered && !!open)
  check('A4 merchant answer extracted from topAnswers authorType MERCHANT', answered?.merchantAnswer === 'Yes, we mark them on the menu.')
  check('A5 unanswered question → merchantAnswer null', open?.merchantAnswer === null)
  check('A6 top non-merchant answer surfaced separately', answered?.topAnswer?.text === 'I think so.' && answered?.topAnswer?.author === 'Some Guest')
  check('A7 blank author falls back to plain words, never blank', open?.author === 'A customer')
  check('A8 upvotes mapped (3) and default (0)', answered?.upvotes === 3 && open?.upvotes === 0)
  check('A9 createTime carried through', answered?.createTime === '2026-06-20T12:00:00Z')
  const listCall = googleCalls.find((c) => c.method === 'GET')
  check('A10 GET targets the connected location questions list', !!listCall && listCall.url.includes('/v1/locations/222/questions'), listCall?.url)
  check('A11 list asks for the answers per question', !!listCall && listCall.url.includes('answersPerQuestion='))
  state.listBody = {}
  const aEmpty = await listGbpQuestions('client-1')
  check('A12 empty Google body → ok with zero questions', aEmpty.ok && aEmpty.questions.length === 0)

  /* ── B. Failed reads are explicit + plain ── */
  group('B. failed reads (honest codes, plain words, no raw leak)')
  state.listStatus = 403; state.listBody = DISABLED_403
  const b1 = await listGbpQuestions('client-1')
  check('B1 disabled API 403 → ok:false code api_disabled', !b1.ok && b1.code === 'api_disabled')
  check('B2 disabled error reads plainly', !b1.ok && b1.error === 'This part of Google is not connected yet.')
  check('B3 raw console URL never leaks to the owner', !b1.ok && !/console\.developers|PERMISSION_DENIED/.test(b1.error))
  state.listBody = { error: { code: 403, message: 'Google My Business Q&A API has not been used in project 1 or it is disabled for mybusinessqanda.googleapis.com' } }
  const b4 = await listGbpQuestions('client-1')
  check('B4 wall-of-text disabled variant also maps to api_disabled', !b4.ok && b4.code === 'api_disabled')
  state.listStatus = 500; state.listBody = { error: { message: 'internal boom xyzzy' } }
  const b5 = await listGbpQuestions('client-1')
  check('B5 plain 500 → code google_error', !b5.ok && b5.code === 'google_error')
  check('B6 500 raw string never leaks', !b5.ok && !b5.error.includes('xyzzy'))
  state.listStatus = 403; state.listBody = { error: { message: 'caller lacks permission' } }
  const b7 = await listGbpQuestions('client-1')
  check('B7 a non-disabled 403 stays google_error (not api_disabled)', !b7.ok && b7.code === 'google_error')
  state.listStatus = 200; state.listBody = Q_LIST
  state.tokenRow = false
  const b8 = await listGbpQuestions('client-1')
  check('B8 no connection row → code not_connected', !b8.ok && b8.code === 'not_connected')
  state.tokenRow = true

  /* ── C. Deterministic answer validation ── */
  group('C. answer validation (deterministic, code-level)')
  check('C1 a plain helpful answer passes', validateAnswer(GOOD_ANSWER).ok)
  check('C2 empty rejected', !validateAnswer('').ok)
  check('C3 whitespace-only rejected', !validateAnswer('   \n ').ok)
  check('C4 over 1000 chars rejected', !validateAnswer('word '.repeat(250)).ok)
  check('C5 URL rejected', !validateAnswer('Yes, see www.example.com for the list.').ok)
  check('C6 bare domain rejected', !validateAnswer('Check ourplace.com and ask for Sam.').ok)
  check('C7 phone rejected', !validateAnswer('Yes, call 555-123-4567 and we will hold one.').ok)
  check('C8 email rejected', !validateAnswer('Email hello@place.io and we can set it up.').ok)
  check('C9 non-string rejected', !validateAnswer(42 as unknown as string).ok)
  check('C10 question id: normal id passes', validQuestionId('AIe9_BHqM4x2'))
  check('C11 question id: path traversal shape refused', !validQuestionId('q/../../locations/999'))
  check('C12 question id: empty and non-string refused', !validQuestionId('') && !validQuestionId(null))

  /* ── D. Upsert flow (POST body + read-back proof) ── */
  group('D. upsert flow (real upsertGbpAnswer over mocked fetch)')
  // Happy path: Google's re-read shows the merchant answer we just sent.
  const echoedList = {
    questions: [{
      name: 'locations/222/questions/q-open',
      author: { displayName: 'Dana P', type: 'REGULAR_USER' },
      text: 'Is there parking nearby?',
      createTime: '2026-07-01T12:00:00Z',
      topAnswers: [{ author: { displayName: 'Yellow Bee Market', type: 'MERCHANT' }, text: GOOD_ANSWER }],
    }],
  }
  state.rateSlot = true; state.upsertStatus = 200; state.listStatus = 200; state.listBody = echoedList
  googleCalls.length = 0
  const d1 = await upsertGbpAnswer('client-1', 'q-open', GOOD_ANSWER)
  check('D1 matching read-back → ok:true live:true', d1.ok && d1.live === true, JSON.stringify(d1))
  const post = googleCalls.find((c) => c.method === 'POST')
  check('D2 POST body is exactly { answer: { text } }', !!post && deepEq(post.body, { answer: { text: GOOD_ANSWER } }), JSON.stringify(post?.body))
  check('D3 POST targets locations/222/questions/q-open/answers:upsert', !!post && post.url.endsWith('/v1/locations/222/questions/q-open/answers:upsert'), post?.url)
  check('D4 exactly one POST + one read-back GET hit Google', googleCalls.filter((c) => c.method === 'POST').length === 1 && googleCalls.filter((c) => c.method === 'GET').length === 1, `got ${googleCalls.length} calls`)
  check('D5 live claim carries the confirmed summary', d1.ok && /confirmed live/.test(d1.summary))

  // Read-back mismatch: Google shows something else → never claim live.
  state.listBody = {
    questions: [{
      name: 'locations/222/questions/q-open', text: 'Is there parking nearby?',
      topAnswers: [{ author: { type: 'MERCHANT' }, text: 'A different answer entirely.' }],
    }],
  }
  const d6 = await upsertGbpAnswer('client-1', 'q-open', GOOD_ANSWER)
  check('D6 read-back mismatch → ok:true live:false', d6.ok && d6.live === false)
  check('D7 mismatch summary says not showing yet', d6.ok && /not showing it yet/.test(d6.summary))

  // Read-back failure: the write may have landed; say so honestly.
  state.listStatus = 500; state.listBody = { error: { message: 'boom' } }
  const d8 = await upsertGbpAnswer('client-1', 'q-open', GOOD_ANSWER)
  check('D8 read-back failure → ok:true live:false, could-not-confirm words', d8.ok && d8.live === false && /could not read it back/.test(d8.summary))
  state.listStatus = 200; state.listBody = echoedList

  // Rate refusal happens BEFORE the write.
  state.rateSlot = false
  googleCalls.length = 0
  const d9 = await upsertGbpAnswer('client-1', 'q-open', GOOD_ANSWER)
  check('D9 rate slot denied → code rate_limited', !d9.ok && d9.code === 'rate_limited')
  check('D10 no Google call after a rate refusal', googleCalls.length === 0)
  state.rateSlot = true

  // Invalid input never touches the network.
  googleCalls.length = 0
  const d11 = await upsertGbpAnswer('client-1', 'q-open', 'See www.example.com')
  check('D11 invalid answer → code invalid', !d11.ok && d11.code === 'invalid')
  const d12 = await upsertGbpAnswer('client-1', 'q/../evil', GOOD_ANSWER)
  check('D12 bad question id → code invalid', !d12.ok && d12.code === 'invalid')
  check('D13 invalid input never touches token/slot/Google', googleCalls.length === 0)

  // Google refuses the write.
  state.upsertStatus = 500; state.upsertBody = { error: { message: 'upstream splat qqzz' } }
  const d14 = await upsertGbpAnswer('client-1', 'q-open', GOOD_ANSWER)
  check('D14 Google POST error → ok:false google_error', !d14.ok && d14.code === 'google_error')
  check('D15 raw Google write error never leaks', !d14.ok && !d14.error.includes('qqzz'))
  state.upsertStatus = 403; state.upsertBody = DISABLED_403
  const d16 = await upsertGbpAnswer('client-1', 'q-open', GOOD_ANSWER)
  check('D16 disabled API on write → code api_disabled, plain words', !d16.ok && d16.code === 'api_disabled' && d16.error === 'This part of Google is not connected yet.')
  state.upsertStatus = 200

  // Not connected surfaces before any Google call.
  state.tokenRow = false
  googleCalls.length = 0
  const d17 = await upsertGbpAnswer('client-1', 'q-open', GOOD_ANSWER)
  check('D17 not-connected → code not_connected, no Google call', !d17.ok && d17.code === 'not_connected' && googleCalls.length === 0)
  state.tokenRow = true

  /* ── E. Owner endpoints: exports + gate order (source-asserted, like verify-gbp-apply J) ── */
  group('E. owner endpoints')
  const qSrc = readFileSync(join(__dirname, '../src/app/api/dashboard/gbp-questions/route.ts'), 'utf8')
  check('E1 gbp-questions exports GET', /export async function GET\(/.test(qSrc))
  check('E2 gbp-questions gates on checkClientAccess', qSrc.includes('checkClientAccess(clientId)'))
  check('E3 gbp-questions has NO tier gate (reading is for every plan)', !qSrc.includes('isProTier'))
  check('E4 gbp-questions failed read returns the machine code', /code: result\.code/.test(qSrc))

  const aSrc = readFileSync(join(__dirname, '../src/app/api/dashboard/gbp-answer/route.ts'), 'utf8')
  check('E5 gbp-answer exports POST', /export async function POST\(/.test(aSrc))
  const idx = {
    access: aSrc.indexOf('checkClientAccess(clientId)'),
    tier: aSrc.indexOf('isProTier('),
    validate: aSrc.indexOf('validateAnswer(body.text)'),
    upsert: aSrc.indexOf('upsertGbpAnswer(clientId'),
  }
  check('E6 gates in order: access → tier → validate → upsert',
    idx.access > 0 && idx.access < idx.tier && idx.tier < idx.validate && idx.validate < idx.upsert,
    JSON.stringify(idx))
  check('E7 rate refusal mapped to 429', /rate_limited[\s\S]{0,200}status: 429/.test(aSrc))
  check('E8 Pro gate returns 403', /Answering from here is on the Pro plan\.[\s\S]{0,80}status: 403/.test(aSrc))
  check('E9 live claimed only from the read-back result', aSrc.includes('live: result.live'))
  check('E10 question id validated before the write', aSrc.indexOf('validQuestionId(body.questionId)') > 0 && aSrc.indexOf('validQuestionId(body.questionId)') < idx.upsert)

  const dSrc = readFileSync(join(__dirname, '../src/app/api/dashboard/gbp-answer-draft/route.ts'), 'utf8')
  check('E11 gbp-answer-draft exports POST', /export async function POST\(/.test(dSrc))
  const dIdx = {
    access: dSrc.indexOf('checkClientAccess(clientId)'),
    tier: dSrc.indexOf('isProTier('),
    refuse: dSrc.indexOf('We do not know enough about your business yet'),
    call: dSrc.indexOf('await callStructuredOutput'),
  }
  check('E12 draft gates in order: access → tier → zero-facts refusal → AI call',
    dIdx.access > 0 && dIdx.access < dIdx.tier && dIdx.tier < dIdx.refuse && dIdx.refuse < dIdx.call,
    JSON.stringify(dIdx))
  check('E13 draft grounded in real facts only (name/concept/menu/location)',
    dSrc.includes('facts.business_name') && dSrc.includes('facts.menu_items') && dSrc.includes('facts.neighborhood_or_area') && dSrc.includes('facts.city'))
  check('E14 draft treats the question as data, never instructions', /never instructions/i.test(dSrc) && dSrc.includes('<question>'))
  check('E15 deterministic backstop: em-dash strip + boundary cut + the SAME answer validator',
    dSrc.includes('truncateAtBoundary') && /\[–—\]/.test(dSrc) && dSrc.includes('validateAnswer(cleaned)'))
  check('E16 draft caps at 600 characters', /DRAFT_MAX = 600/.test(dSrc))
  check('E17 draft never writes to Google (no upsert import)', !dSrc.includes('upsertGbpAnswer'))

  /* ── report ── */
  console.log(`\n${'─'.repeat(60)}\nverify-gbp-qanda: ${pass} passed, ${fail} failed, ${pass + fail} total`)
  if (fail > 0) process.exit(1)
}

main().catch((e) => { console.error('HARNESS CRASH:', e); process.exit(1) })
