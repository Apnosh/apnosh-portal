/**
 * verify-gbp-catphoto — harness for the two new GBP in-app editors:
 * CATEGORIES (kind 'categories' on the field-write engine) and PHOTOS
 * (POST /api/dashboard/gbp-photo over the v4 media create), plus the category
 * search endpoint. Run: node_modules/.bin/tsx scripts/verify-gbp-catphoto.ts
 *
 * ZERO NETWORK, GUARANTEED: global fetch is replaced before any module loads,
 * env points at fake hosts (no .env.local is read), and any request to an
 * unexpected URL throws. Supabase reads (token row, location count, rate slot),
 * Google v1 (categories PATCH + read-back GET, categories:search) and Google v4
 * (media create) are all served by the mock, so the REAL
 * updateClientCategories / getClientCategories / searchListingCategories /
 * uploadPhotoToGbp code runs end-to-end and the harness asserts the exact
 * updateMask + PATCH body Google would have received.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/* ── 1. Fake env BEFORE any import (never load .env.local — no prod creds) ── */
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://supabase.fake'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-key'

/* ── 2. Mock fetch layer ── */
type RecordedCall = { url: string; method: string; body: unknown }
const googleCalls: RecordedCall[] = []
const state = {
  locationCount: 1,
  rateSlot: true,
  /** raw Google v1 GET (categories read-back) response */
  googleRead: {} as Record<string, unknown>,
  /** raw Google v1 categories:search response */
  searchRead: { categories: [] as Array<{ name: string; displayName: string }> },
  /** status + body for the Google v1 PATCH */
  patchStatus: 200,
  /** status + body for the Google v4 media create */
  mediaStatus: 200,
  mediaBody: { name: 'accounts/111/locations/222/media/abc', googleUrl: 'https://lh3.google.com/photo123.jpg' } as Record<string, unknown>,
}
const TOKEN_ROW = {
  id: 'conn-1',
  access_token: 'fake-access-token',
  refresh_token: null,
  token_expires_at: new Date(Date.now() + 3_600_000).toISOString(),
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
    if (url.includes('categories:search')) return json(state.searchRead)
    if (method === 'PATCH') return state.patchStatus === 200 ? json({}) : json({ error: { message: 'boom from google' } }, { status: state.patchStatus })
    return json(state.googleRead) // read-back GET
  }
  if (url.startsWith('https://mybusiness.googleapis.com/v4/')) {
    let body: unknown = null
    if (init?.body) { try { body = JSON.parse(String(init.body)) } catch { body = String(init.body) } }
    googleCalls.push({ url, method, body })
    return state.mediaStatus === 200 ? json(state.mediaBody) : json({ error: { message: 'media boom' } }, { status: state.mediaStatus })
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

const PRIMARY = 'categories/gcid:vietnamese_restaurant'
const A1 = 'categories/gcid:pho_restaurant'
const A2 = 'categories/gcid:noodle_shop'

async function main() {
  const validate = await import('../src/lib/gbp-apply/validate')
  const fields = await import('../src/lib/gbp-apply/fields')
  const listing = await import('../src/lib/gbp-listing')
  const { validateField, pushFieldWrite } = fields

  /* ── A. validateCategories ── */
  group('A. validateCategories')
  check('A1 valid primary + additional passes', validate.validateCategories({ primary: PRIMARY, additional: [A1, A2] }).ok)
  check('A2 valid primary + empty additional passes', validate.validateCategories({ primary: PRIMARY, additional: [] }).ok)
  check('A3 missing primary rejected', !validate.validateCategories({ additional: [A1] }).ok)
  check('A4 empty primary rejected', !validate.validateCategories({ primary: '', additional: [] }).ok)
  check('A5 bad primary pattern rejected (no gcid)', !validate.validateCategories({ primary: 'categories/restaurant', additional: [] }).ok)
  check('A6 bad primary pattern rejected (uppercase)', !validate.validateCategories({ primary: 'categories/gcid:Vietnamese', additional: [] }).ok)
  check('A7 bad primary pattern rejected (bare word)', !validate.validateCategories({ primary: 'vietnamese_restaurant', additional: [] }).ok)
  check('A8 bad additional pattern rejected', !validate.validateCategories({ primary: PRIMARY, additional: ['categories/nope'] }).ok)
  check('A9 >9 additional rejected', !validate.validateCategories({ primary: PRIMARY, additional: Array.from({ length: 10 }, (_, i) => `categories/gcid:extra_${i}`) }).ok)
  check('A10 exactly 9 additional passes', validate.validateCategories({ primary: PRIMARY, additional: Array.from({ length: 9 }, (_, i) => `categories/gcid:extra_${i}`) }).ok)
  check('A11 duplicate additional rejected', !validate.validateCategories({ primary: PRIMARY, additional: [A1, A1] }).ok)
  check('A12 primary repeated in additional rejected', !validate.validateCategories({ primary: PRIMARY, additional: [PRIMARY] }).ok)
  check('A13 additional not a list rejected', !validate.validateCategories({ primary: PRIMARY, additional: 'nope' }).ok)
  check('A14 non-object input rejected', !validate.validateCategories('categories').ok)
  const okCanon = validate.validateCategories({ primary: PRIMARY, additional: [A2, A1] })
  check('A15 valid value carries primary + additional', okCanon.ok && okCanon.value.primary === PRIMARY && deepEq(okCanon.value.additional, [A2, A1]))

  /* ── B. validateField('categories') → cats mapping ── */
  group('B. validateField mapping')
  const vf = validateField('categories', { primary: PRIMARY, additional: [A2, A1] })
  check('B1 categories validated → cats present, patch empty', vf.ok && !!vf.cats && deepEq(vf.patch, {}))
  // A2 ("...noodle_shop") sorts before A1 ("...pho_restaurant"), so the canonical
  // additional set is [A2, A1] regardless of input order.
  check('B2 sent is canonical (additional sorted)', vf.ok && vf.sent === JSON.stringify({ primary: PRIMARY, additional: [A2, A1] }))
  check('B3 wrong type refused (categories as string)', !validateField('categories', 'restaurant').ok)
  check('B4 categories is a known FIELD_KIND', (fields.FIELD_KINDS as readonly string[]).includes('categories'))

  /* ── C. updateClientCategories: PATCH updateMask + body (real over mocked fetch) ── */
  group('C. updateClientCategories PATCH')
  googleCalls.length = 0
  const cRes = await listing.updateClientCategories('client-1', { primary: PRIMARY, additional: [A1, A2] })
  check('C1 updateClientCategories ok', cRes.ok)
  const patch = googleCalls.find((c) => c.method === 'PATCH')
  check('C2 a PATCH was sent', !!patch)
  const mask = patch ? decodeURIComponent(new URL(patch.url).searchParams.get('updateMask') ?? '') : ''
  check('C3 updateMask = categories', mask === 'categories', mask)
  const pb = patch?.body as { categories?: { primaryCategory?: { name?: string }; additionalCategories?: Array<{ name?: string }> } }
  check('C4 body primary name', pb?.categories?.primaryCategory?.name === PRIMARY)
  check('C5 body additional names (name-only objects)', deepEq(pb?.categories?.additionalCategories, [{ name: A1 }, { name: A2 }]))
  check('C6 PATCH targets the connected location', !!patch && patch.url.includes('/v1/locations/222?'))

  /* ── D. pushFieldWrite categories pipeline (injected deps) ── */
  group('D. pushFieldWrite categories states')
  type Deps = Parameters<typeof pushFieldWrite>[3]
  const calls: string[] = []
  const happy = (over: Partial<NonNullable<Deps>> = {}): NonNullable<Deps> => ({
    getToken: async () => { calls.push('token'); return { accessToken: 't', v4Path: 'accounts/111/locations/222' } },
    countAssignedLocations: async () => { calls.push('count'); return 1 },
    acquireSlot: async () => { calls.push('slot'); return true },
    updateListing: async () => { calls.push('update-listing'); return { ok: true as const } },
    getListing: async () => { calls.push('read-listing'); return { ok: true as const, resourceName: 'locations/222', title: 'T', mapsUri: null, fields: {} } },
    updateCategories: async () => { calls.push('update-cats'); return { ok: true as const } },
    getCategories: async () => { calls.push('read-cats'); return { ok: true as const, primary: PRIMARY, additional: [A1, A2] } },
    ...over,
  })

  calls.length = 0
  const d1 = await pushFieldWrite('client-1', 'categories', { primary: PRIMARY, additional: [A2, A1] }, happy())
  check('D1 matching read-back → verified live', d1.ok && d1.detail?.verified === true && d1.summary === 'The categories are confirmed live on the Google profile.')
  check('D2 pipeline order validate→token→count→slot→update-cats→read-cats', deepEq(calls, ['token', 'count', 'slot', 'update-cats', 'read-cats']))
  check('D3 categories never touch the listing PATCH rail', !calls.includes('update-listing') && !calls.includes('read-listing'))

  const d4 = await pushFieldWrite('client-1', 'categories', { primary: PRIMARY, additional: [A1] }, happy({
    getCategories: async () => ({ ok: true as const, primary: PRIMARY, additional: [A1, A2] }),
  }))
  check('D4 extra category on Google → mismatch, NOT live', d4.ok && d4.detail?.verified === false && /not showing the new categories yet/.test(d4.summary ?? ''))

  const d5 = await pushFieldWrite('client-1', 'categories', { primary: PRIMARY, additional: [A1, A2] }, happy({
    getCategories: async () => ({ ok: true as const, primary: A1, additional: [A2, PRIMARY] }),
  }))
  check('D5 different primary → NOT live', d5.ok && d5.detail?.verified === false)

  const d6 = await pushFieldWrite('client-1', 'categories', { primary: PRIMARY, additional: [A2, A1] }, happy({
    getCategories: async () => ({ ok: true as const, primary: PRIMARY, additional: [A1, A2] }),
  }))
  check('D6 additional order-independent match → live', d6.ok && d6.detail?.verified === true)

  const d7 = await pushFieldWrite('client-1', 'categories', { primary: PRIMARY, additional: [A1] }, happy({
    getCategories: async () => ({ ok: false as const, error: 'read exploded' }),
  }))
  check('D7 read-back failure → honest verified:false, readBack null', d7.ok && d7.detail?.verified === false && d7.detail?.readBack === null && /read-back to confirm failed/.test(d7.summary ?? ''))

  const d8 = await pushFieldWrite('client-1', 'categories', { primary: PRIMARY, additional: [A1] }, happy({
    updateCategories: async () => ({ ok: false as const, error: 'google said no' }),
  }))
  check('D8 Google PATCH error → ok:false google_error', !d8.ok && d8.code === 'google_error' && d8.error === 'google said no')

  calls.length = 0
  const d9 = await pushFieldWrite('client-1', 'categories', { primary: 'not-a-resource', additional: [] }, happy())
  check('D9 invalid value → code invalid', !d9.ok && d9.code === 'invalid')
  check('D10 invalid value never touches token/slot/Google', calls.length === 0)

  calls.length = 0
  const d11 = await pushFieldWrite('client-1', 'categories', { primary: PRIMARY, additional: [] }, happy({ countAssignedLocations: async () => { calls.push('count'); return 2 } }))
  check('D11 >1 location refused before any write', !d11.ok && d11.code === 'multi_location' && !calls.includes('update-cats'))

  calls.length = 0
  const d12 = await pushFieldWrite('client-1', 'categories', { primary: PRIMARY, additional: [] }, happy({ acquireSlot: async () => { calls.push('slot'); return false } }))
  check('D12 rate slot denied → rate_limited, no write', !d12.ok && d12.code === 'rate_limited' && !calls.includes('update-cats'))

  /* ── E. end-to-end over default deps + mocked fetch ── */
  group('E. categories end-to-end (default deps over mocked fetch)')
  state.locationCount = 1; state.rateSlot = true; state.patchStatus = 200
  state.googleRead = { categories: { primaryCategory: { name: PRIMARY }, additionalCategories: [{ name: A1 }, { name: A2 }] } }
  googleCalls.length = 0
  const e1 = await pushFieldWrite('client-1', 'categories', { primary: PRIMARY, additional: [A2, A1] })
  check('E1 default-deps categories write goes live', e1.ok && e1.detail?.verified === true, e1.error ?? e1.summary)
  check('E2 exactly one PATCH + one read-back GET hit Google', googleCalls.filter((c) => c.method === 'PATCH').length === 1 && googleCalls.filter((c) => c.method === 'GET' && !c.url.includes('search')).length === 1)
  // Google dropped one → not live.
  state.googleRead = { categories: { primaryCategory: { name: PRIMARY }, additionalCategories: [{ name: A1 }] } }
  const e3 = await pushFieldWrite('client-1', 'categories', { primary: PRIMARY, additional: [A2, A1] })
  check('E3 Google shows fewer categories → NOT live', e3.ok && e3.detail?.verified === false)
  state.rateSlot = false
  const e4 = await pushFieldWrite('client-1', 'categories', { primary: PRIMARY, additional: [] })
  check('E4 rpc rate-slot denial surfaces as rate_limited', !e4.ok && e4.code === 'rate_limited')
  state.rateSlot = true

  /* ── F. category search endpoint shape ── */
  group('F. searchListingCategories + gbp-categories route')
  state.searchRead = { categories: [
    { name: PRIMARY, displayName: 'Vietnamese restaurant' },
    { name: A1, displayName: 'Pho restaurant' },
  ] }
  const s1 = await listing.searchListingCategories('client-1', 'viet')
  check('F1 search returns [{ name, displayName }]', s1.ok && s1.categories.length === 2 && s1.categories[0].name === PRIMARY && s1.categories[0].displayName === 'Vietnamese restaurant')
  const s2 = await listing.searchListingCategories('client-1', 'v')
  check('F2 too-short query returns nothing (no network)', s2.ok && s2.categories.length === 0)
  const catRoute = readFileSync(join(__dirname, '../src/app/api/dashboard/gbp-categories/route.ts'), 'utf8')
  check('F3 gbp-categories exports GET', /export async function GET\(/.test(catRoute))
  check('F4 gbp-categories gates on checkClientAccess', catRoute.includes('checkClientAccess(clientId)'))
  check('F5 gbp-categories is NOT Pro-gated (search is harmless)', !catRoute.includes('isProTier'))
  check('F6 gbp-categories caps at 20 results', /slice\(0,\s*20\)/.test(catRoute))

  /* ── G. photo URL validation ── */
  group('G. photo URL validation')
  const photoRoute = await import('../src/app/api/dashboard/gbp-photo/route')
  const isValid = photoRoute.isValidPhotoUrl
  check('G1 https jpg passes', isValid('https://cdn.example.com/a/photo.jpg'))
  check('G2 https png passes', isValid('https://cdn.example.com/a/photo.png'))
  check('G3 https webp with query passes', isValid('https://cdn.example.com/a/photo.webp?token=abc'))
  check('G4 http rejected (not https)', !isValid('http://cdn.example.com/a/photo.jpg'))
  check('G5 non-image extension rejected', !isValid('https://cdn.example.com/a/file.pdf'))
  check('G6 no extension rejected', !isValid('https://cdn.example.com/a/photo'))
  check('G7 non-string rejected', !isValid(42 as unknown))
  check('G8 empty rejected', !isValid(''))
  check('G9 garbage rejected', !isValid('not a url'))

  /* ── H. uploadPhotoToGbp over mocked v4 fetch ── */
  group('H. uploadPhotoToGbp v4 media create')
  const media = await import('../src/lib/gbp-media')
  googleCalls.length = 0
  state.mediaStatus = 200
  const h1 = await media.uploadPhotoToGbp('client-1', 'https://cdn.example.com/a/photo.jpg')
  check('H1 media create returns the created resource', h1.ok && !!('name' in h1 && h1.name) && ('googleUrl' in h1 && h1.googleUrl === 'https://lh3.google.com/photo123.jpg'))
  const mcall = googleCalls.find((c) => c.method === 'POST' && c.url.includes('/media'))
  check('H2 POST hit the v4 media endpoint on the connected location', !!mcall && mcall.url.includes('/v4/accounts/111/locations/222/media'))
  const mb = mcall?.body as { mediaFormat?: string; sourceUrl?: string }
  check('H3 body is a PHOTO create with the sourceUrl', mb?.mediaFormat === 'PHOTO' && mb?.sourceUrl === 'https://cdn.example.com/a/photo.jpg')
  state.mediaStatus = 500
  const h4 = await media.uploadPhotoToGbp('client-1', 'https://cdn.example.com/a/photo.jpg')
  check('H4 a Google media error → ok:false', !h4.ok)
  state.mediaStatus = 200

  /* ── I. gbp-photo route gate order + honesty (source) ── */
  group('I. gbp-photo route gates')
  const photoSrc = readFileSync(join(__dirname, '../src/app/api/dashboard/gbp-photo/route.ts'), 'utf8')
  check('I1 route exports POST', /export async function POST\(/.test(photoSrc))
  const idx = {
    access: photoSrc.indexOf('checkClientAccess(clientId)'),
    pro: photoSrc.indexOf('isProTier('),
    validate: photoSrc.indexOf('isValidPhotoUrl(body.sourceUrl)'),
    upload: photoSrc.indexOf('uploadPhotoToGbp('),
  }
  check('I2 gates in order: access → Pro → validate → upload',
    idx.access > 0 && idx.access < idx.pro && idx.pro < idx.validate && idx.validate < idx.upload,
    JSON.stringify(idx))
  check('I3 non-Pro returns 403', /Adding photos to Google is on the Pro plan\.[\s\S]{0,80}status: 403/.test(photoSrc))
  check('I4 a bad URL is a 400 before touching Google', /isValidPhotoUrl\(body\.sourceUrl\)[\s\S]{0,220}status: 400/.test(photoSrc))
  check('I5 a returned media resource is reported live:true', /ok: true, live: true/.test(photoSrc))
  check('I6 a media failure is a 502 (never a fake success)', /result\.ok[\s\S]{0,160}status: 502/.test(photoSrc))

  /* ── J. em-dash guard on the new OWNER-FACING strings (not comments) ── */
  group('J. no em dashes in new owner-facing strings')
  const catRouteStr = readFileSync(join(__dirname, '../src/app/api/dashboard/gbp-categories/route.ts'), 'utf8')
  // The category validator error strings the owner actually reads.
  const catErrs = [
    validate.validateCategories({ additional: [] }),
    validate.validateCategories({ primary: 'categories/restaurant', additional: [] }),
    validate.validateCategories({ primary: PRIMARY, additional: ['categories/nope'] }),
    validate.validateCategories({ primary: PRIMARY, additional: [PRIMARY] }),
    validate.validateCategories({ primary: PRIMARY, additional: [A1, A1] }),
    validate.validateCategories({ primary: PRIMARY, additional: Array.from({ length: 10 }, (_, i) => `categories/gcid:x_${i}`) }),
  ].filter((r): r is { ok: false; error: string } => !r.ok).map((r) => r.error)
  const dashFree = (s: string) => !s.includes('—') && !s.includes('–')
  check('J1 category validator messages are dash-free', catErrs.length > 0 && catErrs.every(dashFree))
  const routeStrings = [
    'Adding photos to Google is on the Pro plan.',
    'That is not a photo we can add. Upload a JPG or PNG and try again.',
    'We could not add the photo to Google right now. Try again in a minute.',
    'We could not search categories right now. Try again in a minute.',
  ]
  check('J2 new route owner strings present and dash-free',
    routeStrings.every((s) => (photoSrc.includes(s) || catRouteStr.includes(s)) && dashFree(s)))

  /* ── report ── */
  console.log(`\n${'─'.repeat(60)}\nverify-gbp-catphoto: ${pass} passed, ${fail} failed, ${pass + fail} total`)
  if (fail > 0) process.exit(1)
}

main().catch((e) => { console.error('HARNESS CRASH:', e); process.exit(1) })
