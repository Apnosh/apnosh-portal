/**
 * verify-gbp-apply — unit-style harness for the GBP field-write engine
 * (src/lib/gbp-apply/fields.ts + validate.ts) and the owner Save-to-Google
 * endpoint's gate order. Run: npx tsx scripts/verify-gbp-apply.ts
 *
 * ZERO NETWORK, GUARANTEED: global fetch is replaced before any module loads,
 * env points at fake hosts (no .env.local is read), and any request to an
 * unexpected URL throws. Supabase reads (token row, location count, rate-slot
 * RPC) and Google v1 calls (PATCH + read-back GET) are all served by the mock,
 * so the REAL updateClientListing/getClientListing/getActiveTokenForClient code
 * runs end-to-end and the harness asserts the exact updateMask + PATCH body
 * Google would have received.
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
  locationCount: 1,
  rateSlot: true,
  /** raw Google v1 GET (read-back) response body */
  googleRead: {} as Record<string, unknown>,
  /** status for the Google PATCH */
  patchStatus: 200,
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
    if (url.includes('/channel_connections')) return json(TOKEN_ROW)
    if (url.includes('/gbp_locations')) {
      return new Response(null, { status: 200, headers: { 'content-range': `*/${state.locationCount}` } })
    }
    if (url.includes('/rpc/gbp_acquire_write_slot')) return json(state.rateSlot)
    return json(null)
  }
  if (url.startsWith('https://mybusinessbusinessinformation.googleapis.com/v1/')) {
    let body: unknown = null
    if (init?.body) { try { body = JSON.parse(String(init.body)) } catch { body = String(init.body) } }
    googleCalls.push({ url, method, body })
    if (method === 'PATCH') return state.patchStatus === 200 ? json({}) : json({ error: { message: 'boom from google' } }, { status: state.patchStatus })
    return json(state.googleRead) // read-back GET
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

const VALID_DESC = 'Family-run neighborhood kitchen serving slow-smoked barbecue, house-made sides, and seasonal desserts. We cook everything fresh each morning and serve it with a smile. Stop in for lunch, bring the kids for dinner, or grab a tray to go for game night with friends and neighbors.'
const WEEK = (over: Partial<Record<string, { closed?: boolean; open?: string; close?: string }>> = {}) =>
  ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'].map((day) => ({
    day, closed: false, open: '11:00', close: '21:00', ...(over[day] ?? {}),
  }))

async function main() {
  const validate = await import('../src/lib/gbp-apply/validate')
  const fields = await import('../src/lib/gbp-apply/fields')
  const listing = await import('../src/lib/gbp-listing')
  const dispatch = await import('../src/lib/gbp-apply/dispatch')
  const { validateField, pushFieldWrite } = fields

  /* ── A. Validators ── */
  group('A. description validation')
  check('A1 valid description passes', validate.validateDescription(VALID_DESC).ok)
  check('A2 URL rejected', !validate.validateDescription(VALID_DESC.slice(0, 200) + ' Visit www.example.com for more and join us this week.').ok)
  check('A3 email rejected', !validate.validateDescription(VALID_DESC.slice(0, 220) + ' Write to hello@place.io today for details.').ok)
  check('A4 phone rejected', !validate.validateDescription(VALID_DESC.slice(0, 220) + ' Call 555-123-4567 to book a table.').ok)
  check('A5 over 750 chars rejected', !validate.validateDescription('word '.repeat(200)).ok)

  group('B. website validation')
  check('B1 valid https URL passes', validate.validateWebsite('https://yellowbee.market/menu').ok)
  check('B2 http rejected', !validate.validateWebsite('http://yellowbee.market').ok)
  check('B3 space rejected', !validate.validateWebsite('https://yellow bee.market').ok)
  check('B4 no-dot host rejected', !validate.validateWebsite('https://localhost').ok)
  check('B5 unparseable rejected', !validate.validateWebsite('https://').ok)

  group('C. phone validation')
  check('C1 valid US phone passes', validate.validatePhone('(555) 123-4567').ok)
  check('C2 valid +country passes', validate.validatePhone('+1 555-123-4567').ok)
  check('C3 5 digits rejected', !validate.validatePhone('55512').ok)
  check('C4 16 digits rejected', !validate.validatePhone('5551234567123456').ok)
  check('C5 letters rejected', !validate.validatePhone('555-CALL-NOW').ok)

  group('D. hours validation')
  const okWeek = validate.validateHoursWeek(WEEK({ SUNDAY: { closed: true, open: undefined, close: undefined }, FRIDAY: { close: '24:00' } }))
  check('D1 valid 7-day week passes', okWeek.ok, okWeek.ok ? '' : okWeek.error)
  check('D2 sun closed → empty ranges', okWeek.ok && okWeek.value.sun.length === 0)
  check('D3 mon mapped to 11:00-21:00', okWeek.ok && deepEq(okWeek.value.mon, [{ open: '11:00', close: '21:00' }]))
  const midnight = validate.validateHoursWeek(WEEK({ SATURDAY: { close: '00:00' } }))
  check('D4 close 00:00 canonicalized to 24:00', midnight.ok && deepEq(midnight.value.sat, [{ open: '11:00', close: '24:00' }]))
  check('D5 six days rejected (all-7 rule)', !validate.validateHoursWeek(WEEK().slice(0, 6)).ok)
  check('D6 eight entries rejected', !validate.validateHoursWeek([...WEEK(), { day: 'MONDAY', closed: true }]).ok)
  check('D7 invented day rejected', !validate.validateHoursWeek(WEEK().map((d, i) => i === 0 ? { ...d, day: 'FUNDAY' } : d)).ok)
  check('D8 duplicate day rejected', !validate.validateHoursWeek(WEEK().map((d, i) => i === 1 ? { ...d, day: 'MONDAY' } : d)).ok)
  check('D9 open == close rejected', !validate.validateHoursWeek(WEEK({ TUESDAY: { open: '10:00', close: '10:00' } })).ok)
  const overnight = validate.validateHoursWeek(WEEK({ FRIDAY: { open: '18:00', close: '02:00' } }))
  check('D10 past-midnight close rejected honestly', !overnight.ok && !overnight.ok && /midnight/i.test(overnight.error))
  check('D11 bad time format rejected (9:00)', !validate.validateHoursWeek(WEEK({ MONDAY: { open: '9:00' } })).ok)
  check('D12 bad time format rejected (25:00)', !validate.validateHoursWeek(WEEK({ MONDAY: { close: '25:00' } })).ok)
  check('D13 open day missing times rejected', !validate.validateHoursWeek(WEEK({ WEDNESDAY: { open: undefined } })).ok)
  check('D14 non-boolean closed rejected', !validate.validateHoursWeek(WEEK().map((d, i) => i === 0 ? { ...d, closed: 'yes' as unknown as boolean } : d)).ok)
  check('D15 non-array rejected', !validate.validateHoursWeek({ MONDAY: {} }).ok)
  check('D16 all-7-closed rejected (would erase hours)', !validate.validateHoursWeek(['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY'].map((day) => ({ day, closed: true }))).ok)

  group('E. validateField → patch mapping')
  const vd = validateField('description', VALID_DESC)
  check('E1 description patch key', vd.ok && deepEq(Object.keys(vd.patch), ['description']))
  const vw = validateField('website', 'https://yellowbee.market')
  check('E2 website patch key', vw.ok && deepEq(vw.patch, { websiteUri: 'https://yellowbee.market' }))
  const vp = validateField('phone', '(555) 123-4567')
  check('E3 phone patch key', vp.ok && deepEq(vp.patch, { primaryPhone: '(555) 123-4567' }))
  const vh = validateField('hours', WEEK())
  check('E4 hours patch → regularHours WeeklyHours', vh.ok && !!vh.patch.regularHours && deepEq(vh.patch.regularHours.mon, [{ open: '11:00', close: '21:00' }]))
  check('E5 wrong type refused (hours as string)', !validateField('hours', 'monday to friday 9-5').ok)
  check('E6 wrong type refused (description as array)', !validateField('description', [1, 2]).ok)

  /* ── F. updateMask correctness through the REAL updateClientListing (mock fetch) ── */
  group('F. PATCH updateMask + body per kind (real gbp-listing over mocked fetch)')
  const maskOf = (c: RecordedCall) => decodeURIComponent(new URL(c.url).searchParams.get('updateMask') ?? '')
  async function patchFor(patch: Record<string, unknown>): Promise<RecordedCall> {
    googleCalls.length = 0
    const res = await listing.updateClientListing('client-1', patch)
    if (!res.ok) throw new Error(`updateClientListing failed: ${res.error}`)
    const call = googleCalls.find((c) => c.method === 'PATCH')
    if (!call) throw new Error('no PATCH captured')
    return call
  }
  const f1 = await patchFor({ description: VALID_DESC })
  check('F1 description mask = profile.description', maskOf(f1) === 'profile.description', maskOf(f1))
  check('F2 description body under profile', (f1.body as { profile?: { description?: string } })?.profile?.description === VALID_DESC)
  const f3 = await patchFor({ websiteUri: 'https://yellowbee.market' })
  check('F3 website mask = websiteUri', maskOf(f3) === 'websiteUri', maskOf(f3))
  check('F4 website body', (f3.body as { websiteUri?: string })?.websiteUri === 'https://yellowbee.market')
  const f5 = await patchFor({ primaryPhone: '(555) 123-4567' })
  check('F5 phone mask = phoneNumbers.primaryPhone', maskOf(f5) === 'phoneNumbers.primaryPhone', maskOf(f5))
  check('F6 phone body', (f5.body as { phoneNumbers?: { primaryPhone?: string } })?.phoneNumbers?.primaryPhone === '(555) 123-4567')
  const vhMid = validateField('hours', WEEK({ SUNDAY: { closed: true, open: undefined, close: undefined }, SATURDAY: { close: '24:00' } }))
  if (!vhMid.ok) throw new Error('vhMid should validate')
  const f7 = await patchFor(vhMid.patch as Record<string, unknown>)
  check('F7 hours mask = regularHours', maskOf(f7) === 'regularHours', maskOf(f7))
  const periods = (f7.body as { regularHours?: { periods?: Array<{ openDay: string; openTime: { hours: number }; closeDay: string; closeTime: { hours: number } }> } })?.regularHours?.periods ?? []
  check('F8 6 periods (sunday closed)', periods.length === 6, `got ${periods.length}`)
  const mon = periods.find((p) => p.openDay === 'MONDAY')
  check('F9 MONDAY period 11→21 same-day', !!mon && mon.openTime.hours === 11 && mon.closeDay === 'MONDAY' && mon.closeTime.hours === 21)
  const sat = periods.find((p) => p.openDay === 'SATURDAY')
  check('F10 SATURDAY 24:00 close → closes next day 00:00', !!sat && sat.closeDay === 'SUNDAY' && sat.closeTime.hours === 0)
  check('F11 PATCH targets the connected location', f1.url.includes('/v1/locations/222?'))

  /* ── G. Engine states via injected deps ── */
  group('G. pushFieldWrite pipeline states (injected deps)')
  type Deps = Parameters<typeof pushFieldWrite>[3]
  const calls: string[] = []
  const happyDeps = (over: Partial<NonNullable<Deps>> = {}): NonNullable<Deps> => ({
    getToken: async () => { calls.push('token'); return { accessToken: 't', v4Path: 'accounts/111/locations/222' } },
    countAssignedLocations: async () => { calls.push('count'); return 1 },
    acquireSlot: async () => { calls.push('slot'); return true },
    updateListing: async () => { calls.push('update'); return { ok: true as const } },
    getListing: async () => { calls.push('read'); return { ok: true as const, resourceName: 'locations/222', title: 'T', mapsUri: null, fields: { description: VALID_DESC } } },
    ...over,
  })

  calls.length = 0
  const g1 = await pushFieldWrite('client-1', 'description', VALID_DESC, happyDeps())
  check('G1 matching read-back → verified live', g1.ok && g1.detail?.verified === true && g1.summary === 'The description is confirmed live on the Google profile.')
  check('G2 pipeline order validate→token→count→slot→update→read', deepEq(calls, ['token', 'count', 'slot', 'update', 'read']))

  const g3 = await pushFieldWrite('client-1', 'description', VALID_DESC, happyDeps({
    getListing: async () => ({ ok: true as const, resourceName: 'locations/222', title: 'T', mapsUri: null, fields: { description: 'something else entirely lives here' } }),
  }))
  check('G3 read-back mismatch → ok but NOT live', g3.ok && g3.detail?.verified === false && /not showing the new text yet/.test(g3.summary ?? ''))

  const g4 = await pushFieldWrite('client-1', 'description', VALID_DESC, happyDeps({
    getListing: async () => ({ ok: false as const, error: 'read exploded' }),
  }))
  check('G4 read-back failure → honest verified:false', g4.ok && g4.detail?.verified === false && g4.detail?.readBack === null && /read-back to confirm failed/.test(g4.summary ?? ''))

  calls.length = 0
  const g5 = await pushFieldWrite('client-1', 'description', VALID_DESC, happyDeps({ countAssignedLocations: async () => { calls.push('count'); return 2 } }))
  check('G5 >1 location refused', !g5.ok && g5.code === 'multi_location' && /more than one Google location/.test(g5.error ?? ''))
  check('G6 refusal happens BEFORE any write', !calls.includes('update') && !calls.includes('slot'))

  calls.length = 0
  const g7 = await pushFieldWrite('client-1', 'description', VALID_DESC, happyDeps({ acquireSlot: async () => { calls.push('slot'); return false } }))
  check('G7 rate slot denied → rate_limited code', !g7.ok && g7.code === 'rate_limited' && /Too many Google edits/.test(g7.error ?? ''))
  check('G8 no write after rate refusal', !calls.includes('update'))

  calls.length = 0
  const g9 = await pushFieldWrite('client-1', 'description', 'too short', happyDeps())
  check('G9 invalid value → code invalid', !g9.ok && g9.code === 'invalid')
  check('G10 invalid value never touches token/slot/Google', calls.length === 0)

  const g11 = await pushFieldWrite('client-1', 'website', 'https://yellowbee.market', happyDeps({ getToken: async () => ({ error: 'no connection row' }) }))
  check('G11 not-connected surfaced honestly', !g11.ok && g11.code === 'not_connected' && /Not connected to Google yet/.test(g11.error ?? ''))

  const g12 = await pushFieldWrite('client-1', 'website', 'https://yellowbee.market', happyDeps({ updateListing: async () => ({ ok: false as const, error: 'google said no' }) }))
  check('G12 Google PATCH error → ok:false google_error', !g12.ok && g12.code === 'google_error' && g12.error === 'google said no')

  group('H. read-back normalization per kind (injected deps)')
  const h1 = await pushFieldWrite('client-1', 'phone', '(555) 123-4567', happyDeps({
    getListing: async () => ({ ok: true as const, resourceName: 'locations/222', title: 'T', fields: { primaryPhone: '+1 555-123-4567' } }),
  }))
  check('H1 phone: +1 prefix formatting still verifies', h1.ok && h1.detail?.verified === true)
  const h2 = await pushFieldWrite('client-1', 'phone', '(555) 123-4567', happyDeps({
    getListing: async () => ({ ok: true as const, resourceName: 'locations/222', title: 'T', fields: { primaryPhone: '(555) 999-0000' } }),
  }))
  check('H2 phone: different number does NOT verify', h2.ok && h2.detail?.verified === false)
  const h3 = await pushFieldWrite('client-1', 'website', 'https://Example.com/menu', happyDeps({
    getListing: async () => ({ ok: true as const, resourceName: 'locations/222', title: 'T', fields: { websiteUri: 'https://example.com/menu' } }),
  }))
  check('H3 website: case/host normalization verifies', h3.ok && h3.detail?.verified === true)
  const h4 = await pushFieldWrite('client-1', 'website', 'https://example.com/menu', happyDeps({
    getListing: async () => ({ ok: true as const, resourceName: 'locations/222', title: 'T', fields: { websiteUri: 'https://other.com/menu' } }),
  }))
  check('H4 website: different host does NOT verify', h4.ok && h4.detail?.verified === false)
  const weekly = (validateField('hours', WEEK({ SATURDAY: { close: '00:00' } })) as { ok: true; weekly: import('../src/lib/gbp-listing').WeeklyHours }).weekly
  const h5 = await pushFieldWrite('client-1', 'hours', WEEK({ SATURDAY: { close: '00:00' } }), happyDeps({
    getListing: async () => ({ ok: true as const, resourceName: 'locations/222', title: 'T', fields: { regularHours: { ...weekly, sat: [{ open: '11:00', close: '24:00' }] } } }),
  }))
  check('H5 hours: 00:00 vs 24:00 midnight close still verifies', h5.ok && h5.detail?.verified === true)
  const h6 = await pushFieldWrite('client-1', 'hours', WEEK(), happyDeps({
    getListing: async () => ({ ok: true as const, resourceName: 'locations/222', title: 'T', fields: { regularHours: { ...weekly, tue: [{ open: '09:00', close: '17:00' }] } } }),
  }))
  check('H6 hours: a differing day does NOT verify', h6.ok && h6.detail?.verified === false)

  /* ── I. Full default-deps pipeline over the mocked fetch (real token/count/slot/PATCH/read) ── */
  group('I. end-to-end over mocked fetch + admin-path parity')
  state.locationCount = 1; state.rateSlot = true; state.patchStatus = 200
  state.googleRead = { title: 'T', profile: { description: VALID_DESC } }
  googleCalls.length = 0
  const i1 = await pushFieldWrite('client-1', 'description', VALID_DESC)
  check('I1 default-deps description write goes live', i1.ok && i1.detail?.verified === true, i1.error ?? i1.summary)
  check('I2 exactly one PATCH + one read-back GET hit Google', googleCalls.filter((c) => c.method === 'PATCH').length === 1 && googleCalls.filter((c) => c.method === 'GET').length === 1)

  const action = { kind: 'write' as const, handler: 'description', label: 'Description and services' }
  state.googleRead = { title: 'T', profile: { description: VALID_DESC } }
  const viaDispatch = await dispatch.pushWrite('client-1', action, VALID_DESC)
  const viaFields = await pushFieldWrite('client-1', 'description', VALID_DESC)
  check('I3 admin pushWrite ≡ pushFieldWrite (success shape parity)', deepEq(viaDispatch, viaFields))
  const badDispatch = await dispatch.pushWrite('client-1', action, 'too short')
  const badFields = await pushFieldWrite('client-1', 'description', 'too short')
  check('I4 admin pushWrite ≡ pushFieldWrite (invalid-value parity)', deepEq({ ok: badDispatch.ok, error: badDispatch.error }, { ok: badFields.ok, error: badFields.error }))

  // hours end-to-end: Google "stores" what was PATCHed; read-back returns those periods.
  googleCalls.length = 0
  const weekInput = WEEK({ SUNDAY: { closed: true, open: undefined, close: undefined } })
  state.googleRead = {} // placeholder; set from the PATCH below via a two-step run
  // First run writes; we then replay with the captured periods as the read-back.
  await pushFieldWrite('client-1', 'hours', weekInput)
  const patched = googleCalls.find((c) => c.method === 'PATCH')
  state.googleRead = { title: 'T', regularHours: (patched?.body as { regularHours?: unknown })?.regularHours }
  const i5 = await pushFieldWrite('client-1', 'hours', weekInput)
  check('I5 hours round-trip (write → Google periods → read-back) verifies', i5.ok && i5.detail?.verified === true, i5.summary)

  state.rateSlot = false
  const i6 = await pushFieldWrite('client-1', 'website', 'https://yellowbee.market')
  check('I6 rpc rate-slot denial surfaces as rate_limited', !i6.ok && i6.code === 'rate_limited')
  state.rateSlot = true
  state.locationCount = 3
  const i7 = await pushFieldWrite('client-1', 'website', 'https://yellowbee.market')
  check('I7 multi-location count from DB refuses the write', !i7.ok && i7.code === 'multi_location')
  state.locationCount = 1

  /* ── J. Owner endpoint: exports + gate order ── */
  group('J. owner endpoint /api/dashboard/gbp-apply')
  const routeSrc = readFileSync(join(__dirname, '../src/app/api/dashboard/gbp-apply/route.ts'), 'utf8')
  check('J1 route exports POST', /export async function POST\(/.test(routeSrc))
  const idx = {
    access: routeSrc.indexOf('checkClientAccess(clientId)'),
    tier: routeSrc.indexOf('isProTier('),
    validate: routeSrc.indexOf('validateField(kind'),
    push: routeSrc.indexOf('pushFieldWrite(clientId'),
  }
  check('J2 gates in order: access → tier → validate → push',
    idx.access > 0 && idx.access < idx.tier && idx.tier < idx.validate && idx.validate < idx.push,
    JSON.stringify(idx))
  check('J3 rate refusal mapped to 429', /rate_limited[\s\S]{0,200}status: 429/.test(routeSrc))
  check('J4 Pro gate returns 403', /Saving to Google is on the Pro plan\.[\s\S]{0,80}status: 403/.test(routeSrc))
  check('J5 live claimed only on verified read-back', routeSrc.includes("live: result.detail?.verified === true"))
  let routeImportable = false
  try {
    const mod = await import('../src/app/api/dashboard/gbp-apply/route')
    routeImportable = typeof (mod as { POST?: unknown }).POST === 'function'
  } catch { /* next server runtime not importable under tsx — source checks above cover it */ }
  console.log(routeImportable
    ? '  (route module also imports cleanly under tsx; POST is a function)'
    : '  (route module import under tsx skipped — Next server runtime; gate order asserted from source)')
  if (routeImportable) check('J6 route module POST export is a function', true)

  /* ── report ── */
  console.log(`\n${'─'.repeat(60)}\nverify-gbp-apply: ${pass} passed, ${fail} failed, ${pass + fail} total`)
  if (fail > 0) process.exit(1)
}

main().catch((e) => { console.error('HARNESS CRASH:', e); process.exit(1) })
