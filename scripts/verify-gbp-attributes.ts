/**
 * verify-gbp-attributes — offline harness for the GBP attribute rails:
 *   - read side: src/lib/gbp-attributes.ts (metadata + values merge → curated groups)
 *   - diagnosis: the three attribute sections + the deterministic `advice` line
 *     on EVERY section (real numbers, no em dashes, no invented facts)
 *   - write side: kind 'attributes' through gbp-apply (validate → attributeMask-scoped
 *     PATCH → read-back proof) and the owner endpoint's gate order.
 *
 * Run: npx tsx scripts/verify-gbp-attributes.ts
 *
 * ZERO NETWORK, GUARANTEED (same idiom as verify-gbp-apply.ts): global fetch is
 * replaced before any module loads, env points at fake hosts, and any request to
 * an unexpected URL throws. The REAL production modules run end-to-end over the
 * mock, so the harness asserts the exact attributeMask + PATCH body Google would
 * have received.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/* ── 1. Fake env BEFORE any import ── */
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://supabase.fake'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-key'

/* ── 2. Mock fetch layer ── */
type RecordedCall = { url: string; method: string; body: unknown }
const googleCalls: RecordedCall[] = []

const TOKEN_ROW = {
  id: 'conn-1',
  access_token: 'fake-access-token',
  refresh_token: null,
  token_expires_at: new Date(Date.now() + 3_600_000).toISOString(),
  platform_account_id: 'accounts/111/locations/222',
}

/* ── Fixtures ─────────────────────────────────────────────────────── */

const DESC = 'Yellow Bee Market is a neighborhood grocery and cafe. We stock local produce, bake fresh bread every morning, and pour coffee all day. Families come for the weekend brunch, regulars come for the sandwiches, and everyone leaves with something from the bakery case. Stop by and say hello.'

const SEVENTY_DAYS_AGO = new Date(Date.now() - 70 * 86_400_000).toISOString()

const LISTING_BODY = {
  title: 'Yellow Bee Market',
  profile: { description: DESC },
  phoneNumbers: { primaryPhone: '(555) 123-4567' },
  websiteUri: 'https://yellowbee.market',
  regularHours: {
    periods: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'].map((d) => ({
      openDay: d, openTime: { hours: 8 }, closeDay: d, closeTime: { hours: 21 },
    })),
  },
  categories: {
    primaryCategory: { name: 'categories/gcid:grocery_store', displayName: 'Grocery store' },
    additionalCategories: [{ name: 'categories/gcid:cafe', displayName: 'Cafe' }],
  },
}

const PHOTOS_BODY = {
  mediaItems: Array.from({ length: 79 }, (_, i) => ({
    mediaFormat: 'PHOTO',
    createTime: SEVENTY_DAYS_AGO,
    thumbnailUrl: `https://img.fake/p${i}.jpg`,
  })),
}

const MENUS_BODY = {
  menus: [{
    labels: [{ displayName: 'Menu' }],
    sections: [{
      labels: [{ displayName: 'Mains' }],
      items: [
        { labels: [{ displayName: 'Bibimbap' }] },
        { labels: [{ displayName: 'Bulgogi plate' }] },
        { labels: [{ displayName: 'Kimchi stew' }] },
      ],
    }],
  }],
}

/* Metadata = what Google says is VALID for this location. Mix of shapes:
   one id carries the "attributes/" prefix (defensive strip), one has no
   displayName (label fallback), one is ENUM (non-BOOL exclusion), one
   matches no concept (curation exclusion). */
const METADATA_BODY = {
  attributeMetadata: [
    { attributeId: 'attributes/has_wheelchair_accessible_entrance', valueType: 'BOOL', displayName: 'Wheelchair accessible entrance' },
    { attributeId: 'wheelchair_accessible_parking', valueType: 'BOOL', displayName: 'Wheelchair accessible parking' },
    { attributeId: 'wheelchair_accessible_restroom', valueType: 'BOOL', displayName: 'Wheelchair accessible restroom' },
    { attributeId: 'has_outdoor_seating', valueType: 'BOOL', displayName: 'Outdoor seating' },
    { attributeId: 'good_for_working_on_laptop', valueType: 'BOOL', displayName: 'Good for working on laptop' },
    { attributeId: 'wi_fi', valueType: 'ENUM', displayName: 'Wi-Fi' },
    { attributeId: 'has_dine_in', valueType: 'BOOL', displayName: 'Dine-in' },
    { attributeId: 'has_takeout', valueType: 'BOOL', displayName: 'Takeout' },
    { attributeId: 'has_delivery', valueType: 'BOOL', displayName: 'Delivery' },
    { attributeId: 'has_curbside_pickup', valueType: 'BOOL', displayName: 'Curbside pickup' },
    { attributeId: 'accepts_credit_cards', valueType: 'BOOL', displayName: 'Credit cards' },
    { attributeId: 'accepts_nfc_mobile_payments', valueType: 'BOOL' },
    { attributeId: 'serves_vegetarian_food', valueType: 'BOOL', displayName: 'Vegetarian options' },
  ],
}

/* Current values on the listing. has_no_contact_delivery is NOT in the
   metadata above → invalid for this location → must never be shown. */
const VALUES_BODY = {
  attributes: [
    { name: 'locations/222/attributes/has_wheelchair_accessible_entrance', valueType: 'BOOL', values: [true] },
    { name: 'locations/222/attributes/has_outdoor_seating', valueType: 'BOOL', values: [true] },
    { name: 'locations/222/attributes/has_dine_in', valueType: 'BOOL', values: [true] },
    { name: 'locations/222/attributes/has_takeout', valueType: 'BOOL', values: [true] },
    { name: 'locations/222/attributes/has_delivery', valueType: 'BOOL', values: [false] },
    { name: 'locations/222/attributes/has_curbside_pickup', valueType: 'BOOL', values: [true] },
    { name: 'locations/222/attributes/accepts_credit_cards', valueType: 'BOOL', values: [true] },
    { name: 'locations/222/attributes/accepts_nfc_mobile_payments', valueType: 'BOOL', values: [true] },
    { name: 'locations/222/attributes/has_no_contact_delivery', valueType: 'BOOL', values: [true] },
  ],
}

const state = {
  connRow: TOKEN_ROW as typeof TOKEN_ROW | null,
  locationCount: 1,
  rateSlot: true,
  metaStatus: 200,
  metaBody: METADATA_BODY as unknown,
  valuesStatus: 200,
  valuesBody: VALUES_BODY as unknown,
  patchStatus: 200,
}

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init })

const V1 = 'https://mybusinessbusinessinformation.googleapis.com/v1'

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const method = (init?.method ?? 'GET').toUpperCase()

  if (url.startsWith('http://supabase.fake/rest/v1/')) {
    if (url.includes('/channel_connections')) return json(state.connRow)
    if (url.includes('/gbp_locations')) {
      return new Response(null, { status: 200, headers: { 'content-range': `*/${state.locationCount}` } })
    }
    if (url.includes('/rpc/gbp_acquire_write_slot')) return json(state.rateSlot)
    return json(null) // any other table read (listing health etc) → empty, best-effort paths absorb it
  }
  /* v1 attribute METADATA (valid attributes for the location). */
  if (url.startsWith(`${V1}/attributes?`)) {
    return state.metaStatus === 200 ? json(state.metaBody) : json({ error: { message: 'meta boom' } }, { status: state.metaStatus })
  }
  /* v1 attribute VALUES on the listing: GET current values / PATCH write. */
  if (url.includes('/v1/locations/222/attributes')) {
    if (method === 'PATCH') {
      let body: unknown = null
      if (init?.body) { try { body = JSON.parse(String(init.body)) } catch { body = String(init.body) } }
      googleCalls.push({ url, method, body })
      return state.patchStatus === 200 ? json({}) : json({ error: { message: 'boom from google' } }, { status: state.patchStatus })
    }
    googleCalls.push({ url, method, body: null })
    return state.valuesStatus === 200 ? json(state.valuesBody) : json({ error: { message: 'values boom' } }, { status: state.valuesStatus })
  }
  /* v1 listing read. */
  if (url.startsWith(`${V1}/locations/222?`)) return json(LISTING_BODY)
  /* v4 photos + food menus. */
  if (url.includes('mybusiness.googleapis.com/v4/') && url.includes('/media')) return json(PHOTOS_BODY)
  if (url.includes('mybusiness.googleapis.com/v4/') && url.includes('/foodMenus')) return json(MENUS_BODY)
  throw new Error(`UNEXPECTED NETWORK CALL (harness must stay offline): ${method} ${url}`)
}) as typeof fetch

/* ── 3. Tiny suite ── */
let pass = 0, fail = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const group = (name: string) => console.log(`\n${name}`)
const deepEq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

async function main() {
  const attrsMod = await import('../src/lib/gbp-attributes')
  const diagnoseMod = await import('../src/lib/gbp-diagnose')
  const validate = await import('../src/lib/gbp-apply/validate')
  const fields = await import('../src/lib/gbp-apply/fields')
  const listing = await import('../src/lib/gbp-listing')
  const { readGbpAttributes } = attrsMod
  const { validateField, pushFieldWrite, FIELD_KINDS } = fields

  /* ── A. Read side: metadata + values merge → curated groups ── */
  group('A. readGbpAttributes merge (metadata gates what is shown; values fill in answers)')
  const read = await readGbpAttributes('client-1')
  check('A1 read ok', read.ok, read.ok ? '' : read.error)
  if (!read.ok) throw new Error('cannot continue without a successful read')
  const g = read.groups
  check('A2 getting group = the 3 wheelchair/parking attributes in metadata order',
    deepEq(g.getting.map((i) => i.id), ['has_wheelchair_accessible_entrance', 'wheelchair_accessible_parking', 'wheelchair_accessible_restroom']),
    JSON.stringify(g.getting.map((i) => i.id)))
  check('A3 "attributes/" prefix on a metadata id normalized to the bare id',
    g.getting.some((i) => i.id === 'has_wheelchair_accessible_entrance'))
  check('A4 answered attribute reads its real value (entrance = true)',
    g.getting.find((i) => i.id === 'has_wheelchair_accessible_entrance')?.value === true)
  check('A5 never-answered attribute is null, not false (parking)',
    g.getting.find((i) => i.id === 'wheelchair_accessible_parking')?.value === null)
  check('A6 wheelchair_accessible_restroom lands in getting, not seating (first match wins)',
    g.getting.some((i) => i.id === 'wheelchair_accessible_restroom') && !g.seating.some((i) => i.id === 'wheelchair_accessible_restroom'))
  check('A7 seating group = outdoor seating + laptop',
    deepEq(g.seating.map((i) => i.id), ['has_outdoor_seating', 'good_for_working_on_laptop']),
    JSON.stringify(g.seating.map((i) => i.id)))
  check('A8 label comes from Google displayName',
    g.seating.find((i) => i.id === 'has_outdoor_seating')?.label === 'Outdoor seating')
  check('A9 missing displayName falls back to a humanized id',
    g.service.find((i) => i.id === 'accepts_nfc_mobile_payments')?.label === 'Nfc mobile payments',
    g.service.find((i) => i.id === 'accepts_nfc_mobile_payments')?.label)
  check('A10 service group = the 6 dine/takeout/delivery/curbside/payment attributes',
    deepEq(g.service.map((i) => i.id), ['has_dine_in', 'has_takeout', 'has_delivery', 'has_curbside_pickup', 'accepts_credit_cards', 'accepts_nfc_mobile_payments']),
    JSON.stringify(g.service.map((i) => i.id)))
  check('A11 an answered "No" stays false (delivery), never mistaken for unset',
    g.service.find((i) => i.id === 'has_delivery')?.value === false)
  const allIds = [...g.getting, ...g.seating, ...g.service].map((i) => i.id)
  check('A12 non-BOOL attribute (wi_fi ENUM) excluded', !allIds.includes('wi_fi'))
  check('A13 BOOL attribute matching no concept (serves_vegetarian_food) excluded', !allIds.includes('serves_vegetarian_food'))
  check('A14 value present but NOT valid per metadata (has_no_contact_delivery) excluded', !allIds.includes('has_no_contact_delivery'))

  /* ── B. Read side: cap + honest failures ── */
  group('B. group cap + failed reads stay honest')
  state.metaBody = {
    attributeMetadata: Array.from({ length: 10 }, (_, i) => ({
      attributeId: `parking_option_${i}`, valueType: 'BOOL', displayName: `Parking option ${i}`,
    })),
  }
  const capped = await readGbpAttributes('client-1')
  check('B1 a group is capped at 8 items', capped.ok && capped.groups.getting.length === 8,
    capped.ok ? String(capped.groups.getting.length) : capped.error)
  state.metaBody = METADATA_BODY
  state.metaStatus = 500
  const metaFail = await readGbpAttributes('client-1')
  check('B2 metadata read failure → ok:false with Google error, no invented groups', !metaFail.ok && /meta boom/.test(metaFail.ok ? '' : metaFail.error))
  state.metaStatus = 200
  state.valuesStatus = 500
  const valFail = await readGbpAttributes('client-1')
  check('B3 values read failure → ok:false (a partial merge could fake "not set")', !valFail.ok && /values boom/.test(valFail.ok ? '' : valFail.error))
  state.valuesStatus = 200
  state.connRow = null
  const noConn = await readGbpAttributes('client-1')
  check('B4 no connection → ok:false with the connection error', !noConn.ok && /No active Google Business Profile connection/.test(noConn.ok ? '' : noConn.error))
  state.connRow = TOKEN_ROW

  /* ── C. Diagnosis: three attribute sections + advice on EVERY section ── */
  group('C. diagnoseGbp sections + deterministic advice from real reads')
  googleCalls.length = 0
  const diag = await diagnoseMod.diagnoseGbp('client-1')
  const keys = diag.sections.map((s) => s.key)
  check('C1 nine sections in order (six originals then getting/seating/service)',
    deepEq(keys, ['hours', 'categories', 'description', 'photos', 'menu', 'links', 'getting', 'seating', 'service']),
    JSON.stringify(keys))
  const getting = diag.sections.find((s) => s.key === 'getting')
  const seating = diag.sections.find((s) => s.key === 'seating')
  const service = diag.sections.find((s) => s.key === 'service')
  check('C2 getting: any blank answer → needs-work, current counts honestly',
    getting?.status === 'needs-work' && getting.current === '1 of 3 set.', `${getting?.status} / ${getting?.current}`)
  check('C3 getting detail is kind attrs with null for the unset items',
    getting?.detail?.kind === 'attrs'
      && getting.detail.items.length === 3
      && getting.detail.items.find((i) => i.id === 'wheelchair_accessible_parking')?.value === null
      && getting.detail.items.find((i) => i.id === 'has_wheelchair_accessible_entrance')?.value === true)
  check('C4 getting advice names the ACTUAL unset labels',
    !!getting?.advice
      && getting.advice.includes('Wheelchair accessible parking')
      && getting.advice.includes('Wheelchair accessible restroom')
      && getting.advice.includes('Yes or No both help'),
    getting?.advice)
  check('C5 service: all answered → good, current "6 of 6 set."',
    service?.status === 'good' && service.current === '6 of 6 set.', `${service?.status} / ${service?.current}`)
  check('C6 service advice = confirmation with the real count + one concrete idea',
    !!service?.advice && service.advice.startsWith('All 6 answers are set.') && /One idea:/.test(service.advice),
    service?.advice)
  check('C7 seating current "1 of 2 set." and labels Seating and space',
    seating?.current === '1 of 2 set.' && seating.label === 'Seating and space')
  check('C8 advice present and non-empty on ALL nine sections',
    diag.sections.every((s) => typeof s.advice === 'string' && s.advice.length > 0),
    JSON.stringify(diag.sections.filter((s) => !s.advice).map((s) => s.key)))
  const photos = diag.sections.find((s) => s.key === 'photos')
  check('C9 photos advice uses the REAL count and newest age',
    !!photos?.advice && photos.advice.includes('79 photos') && photos.advice.includes('about 2 months'),
    photos?.advice)
  const desc = diag.sections.find((s) => s.key === 'description')
  check('C10 description advice carries the real character count',
    !!desc?.advice && desc.advice.includes(`${DESC.trim().length} characters`),
    desc?.advice)
  const hours = diag.sections.find((s) => s.key === 'hours')
  check('C11 hours advice: all 7 days set → confirmation + special-hours idea',
    !!hours?.advice && hours.advice.includes('All 7 days are set') && /special hours/.test(hours.advice),
    hours?.advice)
  const cats = diag.sections.find((s) => s.key === 'categories')
  check('C12 categories advice: real count + generic cuisine suggestion only',
    !!cats?.advice && cats.advice.includes('2 categories') && /cuisine that is not listed/.test(cats.advice),
    cats?.advice)
  const menu = diag.sections.find((s) => s.key === 'menu')
  check('C13 menu advice uses the real item count', !!menu?.advice && menu.advice.includes('3 items'), menu?.advice)
  const links = diag.sections.find((s) => s.key === 'links')
  check('C14 links advice: both set → confirmation + concrete idea',
    !!links?.advice && links.advice.includes('Website and phone are both set') && /One idea:/.test(links.advice),
    links?.advice)
  check('C15 no em or en dashes in any advice',
    diag.sections.every((s) => !/[–—]/.test(s.advice ?? '')))
  check('C16 no invented specifics in advice (no search volumes, no competitor names)',
    diag.sections.every((s) => !/searches per month|competitor/i.test(s.advice ?? '')))

  state.metaStatus = 500
  const diagFail = await diagnoseMod.diagnoseGbp('client-1')
  const failGetting = diagFail.sections.find((s) => s.key === 'getting')
  check('C17 failed attributes read → the three sections unknown, honest wording, advice still present',
    diagFail.sections.filter((s) => ['getting', 'seating', 'service'].includes(s.key)).every((s) =>
      s.status === 'unknown' && s.current === 'We could not read these right now.' && !!s.advice),
    JSON.stringify(failGetting))
  check('C18 failed attributes read never blocks the other sections',
    diagFail.sections.find((s) => s.key === 'photos')?.status === 'good'
      && diagFail.sections.find((s) => s.key === 'hours')?.status === 'good')
  check('C19 failure recorded in notes', diagFail.notes.some((n) => /Attributes read failed/.test(n)))
  state.metaStatus = 200

  /* ── D. Write validation (deterministic, before anything touches Google) ── */
  group('D. attributes validation')
  const va = validate.validateAttributes
  check('D1 non-array rejected', !va('has_dine_in').ok)
  check('D2 empty list rejected', !va([]).ok)
  check('D3 more than 20 items rejected', !va(Array.from({ length: 21 }, (_, i) => ({ id: `attr_${i}`, value: true }))).ok)
  check('D4 empty id rejected', !va([{ id: '', value: true }]).ok)
  check('D5 path-unsafe id rejected (slash)', !va([{ id: 'attributes/has_dine_in', value: true }]).ok)
  check('D6 path-unsafe id rejected (dots + traversal)', !va([{ id: '../locations', value: true }]).ok)
  check('D7 non-boolean value rejected', !va([{ id: 'has_dine_in', value: 'yes' }]).ok)
  check('D8 missing value rejected', !va([{ id: 'has_dine_in' }]).ok)
  check('D9 duplicate id rejected', !va([{ id: 'has_dine_in', value: true }, { id: 'has_dine_in', value: false }]).ok)
  const okList = va([{ id: 'has_outdoor_seating', value: false }, { id: 'has_dine_in', value: true }])
  check('D10 valid list passes with both values kept exactly',
    okList.ok && deepEq(okList.value, [{ id: 'has_outdoor_seating', value: false }, { id: 'has_dine_in', value: true }]))
  const vf = validateField('attributes', [{ id: 'has_outdoor_seating', value: false }, { id: 'has_dine_in', value: true }])
  check('D11 validateField → canonical id-sorted attrs map',
    vf.ok && deepEq(vf.attrs, { has_dine_in: true, has_outdoor_seating: false }))
  check('D12 validateField sent string is the canonical JSON',
    vf.ok && vf.sent === JSON.stringify({ has_dine_in: true, has_outdoor_seating: false }))
  check('D13 wrong kind value shape refused (object)', !validateField('attributes', { has_dine_in: true }).ok)

  /* ── E. PATCH body + attributeMask through the REAL updateClientAttributes ── */
  group('E. attributeMask-scoped PATCH (real gbp-listing over mocked fetch)')
  googleCalls.length = 0
  const up = await listing.updateClientAttributes('client-1', { has_dine_in: true, has_outdoor_seating: false })
  check('E1 updateClientAttributes ok', up.ok, up.ok ? '' : up.error)
  const patch = googleCalls.find((c) => c.method === 'PATCH')
  const mask = patch ? decodeURIComponent(new URL(patch.url).searchParams.get('attributeMask') ?? '') : ''
  check('E2 PATCH targets the connected location attributes resource', !!patch && patch.url.startsWith(`${V1}/locations/222/attributes?`))
  check('E3 attributeMask lists ONLY the sent ids (a save never clears others)',
    mask === 'attributes/has_dine_in,attributes/has_outdoor_seating', mask)
  const patchBody = patch?.body as { name?: string; attributes?: Array<{ name: string; valueType: string; values: unknown[] }> }
  check('E4 body attributes = exactly the sent pairs as BOOL values',
    deepEq(patchBody?.attributes, [
      { name: 'attributes/has_dine_in', valueType: 'BOOL', values: [true] },
      { name: 'attributes/has_outdoor_seating', valueType: 'BOOL', values: [false] },
    ]), JSON.stringify(patchBody?.attributes))
  check('E5 body name is the location attributes resource', patchBody?.name === 'locations/222/attributes')

  /* ── F. pushFieldWrite pipeline for kind attributes (injected deps) ── */
  group('F. pushFieldWrite attributes states (injected deps)')
  type Deps = NonNullable<Parameters<typeof pushFieldWrite>[3]>
  const ITEMS = [{ id: 'has_dine_in', value: true }, { id: 'has_outdoor_seating', value: false }]
  const calls: string[] = []
  const happyDeps = (over: Partial<Deps> = {}): Deps => ({
    getToken: async () => { calls.push('token'); return { accessToken: 't', v4Path: 'accounts/111/locations/222' } },
    countAssignedLocations: async () => { calls.push('count'); return 1 },
    acquireSlot: async () => { calls.push('slot'); return true },
    updateListing: async () => { calls.push('updateListing'); return { ok: true as const } },
    getListing: async () => { calls.push('readListing'); return { ok: true as const, resourceName: 'locations/222', title: 'T', mapsUri: null, fields: {} } },
    updateAttributes: async () => { calls.push('updateAttrs'); return { ok: true as const } },
    getAttributes: async () => { calls.push('readAttrs'); return { ok: true as const, values: { has_dine_in: true, has_outdoor_seating: false } } },
    ...over,
  })

  calls.length = 0
  const f1 = await pushFieldWrite('client-1', 'attributes', ITEMS, happyDeps())
  check('F1 every sent id read back at its sent value → verified live',
    f1.ok && f1.detail?.verified === true && f1.summary === 'The listing options are confirmed live on the Google profile.',
    JSON.stringify(f1))
  check('F2 pipeline order token→count→slot→updateAttrs→readAttrs (attribute rails, not the listing PATCH)',
    deepEq(calls, ['token', 'count', 'slot', 'updateAttrs', 'readAttrs']), JSON.stringify(calls))
  const f3 = await pushFieldWrite('client-1', 'attributes', ITEMS, happyDeps({
    getAttributes: async () => ({ ok: true as const, values: { has_dine_in: true, has_outdoor_seating: true } }),
  }))
  check('F3 one flipped value in the read-back → ok but NOT live',
    f3.ok && f3.detail?.verified === false && /not showing the new answers yet/.test(f3.summary ?? ''))
  const f4 = await pushFieldWrite('client-1', 'attributes', ITEMS, happyDeps({
    getAttributes: async () => ({ ok: true as const, values: { has_dine_in: true } }),
  }))
  check('F4 a sent id MISSING from the read-back → not live (Google dropped it)',
    f4.ok && f4.detail?.verified === false)
  const f5 = await pushFieldWrite('client-1', 'attributes', ITEMS, happyDeps({
    getAttributes: async () => ({ ok: false as const, error: 'read exploded' }),
  }))
  check('F5 read-back failure → honest verified:false with null readBack',
    f5.ok && f5.detail?.verified === false && f5.detail?.readBack === null && /read-back to confirm failed/.test(f5.summary ?? ''))
  const f6 = await pushFieldWrite('client-1', 'attributes', ITEMS, happyDeps({
    updateAttributes: async () => ({ ok: false as const, error: 'google said no' }),
  }))
  check('F6 Google PATCH error → ok:false google_error', !f6.ok && f6.code === 'google_error' && f6.error === 'google said no')
  calls.length = 0
  const f7 = await pushFieldWrite('client-1', 'attributes', [{ id: 'bad/id', value: true }], happyDeps())
  check('F7 invalid value → code invalid, never touches token/slot/Google', !f7.ok && f7.code === 'invalid' && calls.length === 0)
  calls.length = 0
  const f8 = await pushFieldWrite('client-1', 'attributes', ITEMS, happyDeps({ acquireSlot: async () => { calls.push('slot'); return false } }))
  check('F8 rate slot denied → rate_limited, no write', !f8.ok && f8.code === 'rate_limited' && !calls.includes('updateAttrs'))
  const f9 = await pushFieldWrite('client-1', 'attributes', ITEMS, happyDeps({ countAssignedLocations: async () => 2 }))
  check('F9 multi-location client refused before any write', !f9.ok && f9.code === 'multi_location')
  const f10 = await pushFieldWrite('client-1', 'attributes', ITEMS, happyDeps({ getToken: async () => ({ error: 'no row' }) }))
  check('F10 not connected surfaced honestly', !f10.ok && f10.code === 'not_connected')
  check('F11 read-back detail reports what each id actually reads',
    f3.ok && f3.detail?.readBack === JSON.stringify({ has_dine_in: true, has_outdoor_seating: true }), String(f3.ok && f3.detail?.readBack))

  /* ── G. Default-deps end-to-end over the mocked fetch ── */
  group('G. end-to-end (real updateClientAttributes + getClientAttributes over mock)')
  state.valuesBody = {
    attributes: [
      { name: 'locations/222/attributes/has_dine_in', valueType: 'BOOL', values: [true] },
      { name: 'locations/222/attributes/has_outdoor_seating', valueType: 'BOOL', values: [false] },
    ],
  }
  googleCalls.length = 0
  const g1 = await pushFieldWrite('client-1', 'attributes', ITEMS)
  check('G1 default-deps attributes write goes live on a matching re-read',
    g1.ok && g1.detail?.verified === true, JSON.stringify(g1))
  check('G2 exactly one PATCH + one values re-read hit Google',
    googleCalls.filter((c) => c.method === 'PATCH').length === 1 && googleCalls.filter((c) => c.method === 'GET').length === 1,
    JSON.stringify(googleCalls.map((c) => c.method)))
  const g1patch = googleCalls.find((c) => c.method === 'PATCH')
  const g1mask = g1patch ? decodeURIComponent(new URL(g1patch.url).searchParams.get('attributeMask') ?? '') : ''
  check('G3 end-to-end attributeMask still scoped to only the sent ids',
    g1mask === 'attributes/has_dine_in,attributes/has_outdoor_seating', g1mask)
  state.valuesBody = {
    attributes: [
      { name: 'locations/222/attributes/has_dine_in', valueType: 'BOOL', values: [true] },
      { name: 'locations/222/attributes/has_outdoor_seating', valueType: 'BOOL', values: [true] },
    ],
  }
  const g4 = await pushFieldWrite('client-1', 'attributes', ITEMS)
  check('G4 Google storing a different value → live:false, never claimed', g4.ok && g4.detail?.verified === false)
  state.valuesBody = VALUES_BODY
  state.patchStatus = 500
  const g5 = await pushFieldWrite('client-1', 'attributes', ITEMS)
  check('G5 Google PATCH 500 surfaces as google_error with the real message',
    !g5.ok && g5.code === 'google_error' && /boom from google/.test(g5.error ?? ''))
  state.patchStatus = 200

  /* ── H. Owner endpoint contract ── */
  group('H. owner endpoint /api/dashboard/gbp-apply')
  check('H1 FIELD_KINDS includes attributes (the endpoint accepts the kind)', (FIELD_KINDS as readonly string[]).includes('attributes'))
  const routeSrc = readFileSync(join(__dirname, '../src/app/api/dashboard/gbp-apply/route.ts'), 'utf8')
  const idx = {
    access: routeSrc.indexOf('checkClientAccess(clientId)'),
    tier: routeSrc.indexOf('isProTier('),
    validate: routeSrc.indexOf('validateField(kind'),
    push: routeSrc.indexOf('pushFieldWrite(clientId'),
  }
  check('H2 gates in order: access → Pro tier → validate → push',
    idx.access > 0 && idx.access < idx.tier && idx.tier < idx.validate && idx.validate < idx.push, JSON.stringify(idx))
  check('H3 rate refusal mapped to 429', /rate_limited[\s\S]{0,200}status: 429/.test(routeSrc))
  check('H4 live claimed only on verified read-back', routeSrc.includes('live: result.detail?.verified === true'))
  check('H5 attributes contract documented on the endpoint', /attributes\s*:.*Array<\{ id: string, value: boolean \}>/.test(routeSrc))

  /* ── report ── */
  console.log(`\n${'─'.repeat(60)}\nverify-gbp-attributes: ${pass} passed, ${fail} failed, ${pass + fail} total`)
  if (fail > 0) process.exit(1)
}

main().catch((e) => { console.error('HARNESS CRASH:', e); process.exit(1) })
