import 'server-only'
/**
 * gbp-apply/fields — the generic single-field write engine for the Google Business
 * Profile fields the v1 API supports editing: description, hours (regularHours),
 * website (websiteUri), phone (phoneNumbers.primaryPhone), and yes/no listing
 * attributes (the v1 attributes sub-resource, attributeMask-scoped).
 *
 * One honesty contract for every kind, identical to the description path that
 * shipped first in dispatch.ts (whose description branch now delegates here):
 *   1. validate BEFORE anything else — an invalid value never burns a rate slot
 *      or reaches Google (deterministic, code-level, no AI);
 *   2. refuse the ambiguous multi-location client;
 *   3. take a per-location rate slot (Google's un-raisable 10 edits/min cap);
 *   4. PATCH via updateClientListing (which builds the per-field updateMask);
 *   5. read the field back and COMPARE — only a matching read-back earns
 *      "live"/verified:true; anything else is reported for what it is.
 *
 * Every collaborator is injectable (FieldWriteDeps) so the whole pipeline is
 * harness-testable with zero network: scripts/verify-gbp-apply.ts.
 */
import { getActiveTokenForClient } from '@/lib/gbp-menu'
import { updateClientListing, getClientListing, updateClientAttributes, getClientAttributes, type ListingFields, type WeeklyHours, type DayKey, type AttributeValues } from '@/lib/gbp-listing'
import { createAdminClient } from '@/lib/supabase/admin'
import { acquireWriteSlot } from './pace'
import { validateDescription, validateWebsite, validatePhone, validateHoursWeek, validateAttributes, type HoursDayInput, type AttributeWriteItem } from './validate'

export type FieldKind = 'description' | 'hours' | 'website' | 'phone' | 'attributes'
export const FIELD_KINDS: readonly FieldKind[] = ['description', 'hours', 'website', 'phone', 'attributes'] as const

/** Same shape as dispatch.ts PushOutcome, plus a machine-readable code so callers
 *  (the owner endpoint) can map refusals to honest HTTP statuses (e.g. 429). */
export type FieldWriteOutcome = {
  ok: boolean
  summary?: string
  error?: string
  code?: 'invalid' | 'not_connected' | 'multi_location' | 'rate_limited' | 'google_error'
  detail?: { sent?: string; readBack?: string | null; verified?: boolean } & Record<string, unknown>
}

export type ValidatedField =
  | { ok: true; kind: FieldKind; patch: ListingFields; sent: string; weekly?: WeeklyHours; attrs?: AttributeValues }
  | { ok: false; error: string }

/** Canonical id → boolean map (ids sorted) so `sent` and the read-back proof
 *  compare order-independently. */
function canonAttrs(items: AttributeWriteItem[]): AttributeValues {
  const out: AttributeValues = {}
  for (const id of items.map((i) => i.id).sort()) {
    const item = items.find((i) => i.id === id) as AttributeWriteItem
    out[id] = item.value
  }
  return out
}

/** Validate + normalize one field value into the exact ListingFields patch that will be
 *  PATCHed (updateClientListing derives the updateMask from which key is present). */
export function validateField(kind: FieldKind, value: unknown): ValidatedField {
  switch (kind) {
    case 'description': {
      if (typeof value !== 'string') return { ok: false, error: 'The description must be text.' }
      const check = validateDescription(value)
      if (!check.ok) return check
      return { ok: true, kind, patch: { description: check.value }, sent: check.value }
    }
    case 'website': {
      if (typeof value !== 'string') return { ok: false, error: 'The website address must be text.' }
      const check = validateWebsite(value)
      if (!check.ok) return check
      return { ok: true, kind, patch: { websiteUri: check.value }, sent: check.value }
    }
    case 'phone': {
      if (typeof value !== 'string') return { ok: false, error: 'The phone number must be text.' }
      const check = validatePhone(value)
      if (!check.ok) return check
      return { ok: true, kind, patch: { primaryPhone: check.value }, sent: check.value }
    }
    case 'hours': {
      const check = validateHoursWeek(value)
      if (!check.ok) return check
      return { ok: true, kind, patch: { regularHours: check.value }, sent: JSON.stringify(canonWeekly(check.value)), weekly: check.value }
    }
    case 'attributes': {
      const check = validateAttributes(value)
      if (!check.ok) return check
      const attrs = canonAttrs(check.value)
      /* patch stays empty: attributes write through their own v1 endpoint
         (updateClientAttributes with an attributeMask), not the listing PATCH. */
      return { ok: true, kind, patch: {}, sent: JSON.stringify(attrs), attrs }
    }
    default:
      return { ok: false, error: `"${String(kind)}" is not a field this save supports.` }
  }
}

/* ── Read-back normalizers: forgive pure FORMATTING differences, never content ones ── */

const normText = (s: string) => s.replace(/\s+/g, ' ').trim()

/** Lowercase scheme+host, drop a bare trailing slash — Google returns the URL it stored,
 *  sometimes with a canonicalized host or an added root slash. Content must match. */
function normWebsite(s: string): string {
  try {
    const u = new URL(s.trim())
    const path = u.pathname === '/' ? '' : u.pathname
    return `${u.protocol}//${u.host}${path}${u.search}`.toLowerCase()
  } catch {
    return s.trim().toLowerCase()
  }
}

/** Digits only. Google reformats phone numbers (spacing, +1 prefix), so two numbers match
 *  when their digits are equal, or when one is the other plus a 1–3 digit country prefix. */
function phoneMatches(sent: string, readBack: string): boolean {
  const a = sent.replace(/\D/g, '')
  const b = readBack.replace(/\D/g, '')
  if (!a || !b) return false
  if (a === b) return true
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a]
  return shorter.length >= 10 && longer.length - shorter.length <= 3 && longer.endsWith(shorter)
}

const DAY_KEYS: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

/** Canonical weekly hours: per-day ranges sorted by open, '00:00' close read as '24:00'. */
function canonWeekly(w: WeeklyHours | null | undefined): WeeklyHours {
  const out: WeeklyHours = { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] }
  for (const day of DAY_KEYS) {
    out[day] = (w?.[day] ?? [])
      .map((r) => ({ open: r.open, close: r.close === '00:00' ? '24:00' : r.close }))
      .sort((x, y) => x.open.localeCompare(y.open))
  }
  return out
}

function weeklyEqual(a: WeeklyHours | null | undefined, b: WeeklyHours | null | undefined): boolean {
  return JSON.stringify(canonWeekly(a)) === JSON.stringify(canonWeekly(b))
}

/** The kinds that write through the listing PATCH + listing read-back.
 *  'attributes' has its own endpoint pair and is branched before these. */
type ListingFieldKind = Exclude<FieldKind, 'attributes'>

/** Pull the just-written field out of a fresh listing read, as a display string. */
function readBackFor(kind: ListingFieldKind, fields: ListingFields): string | null {
  switch (kind) {
    case 'description': return fields.description ?? null
    case 'website': return fields.websiteUri ?? null
    case 'phone': return fields.primaryPhone ?? null
    case 'hours': return fields.regularHours ? JSON.stringify(canonWeekly(fields.regularHours)) : null
  }
}

function readBackMatches(kind: ListingFieldKind, checked: Extract<ValidatedField, { ok: true }>, fields: ListingFields): boolean {
  switch (kind) {
    case 'description': return normText(fields.description ?? '') === normText(checked.sent)
    case 'website': return normWebsite(fields.websiteUri ?? '') === normWebsite(checked.sent)
    case 'phone': return phoneMatches(checked.sent, fields.primaryPhone ?? '')
    case 'hours': return weeklyEqual(checked.weekly ?? null, fields.regularHours ?? null)
  }
}

/* ── Per-kind honest wording (description strings are byte-identical to the original
 *    dispatch.ts push path — proven by the harness parity check) ── */

const KIND_TEXT: Record<FieldKind, { confirmed: string; pending: string; readFail: string }> = {
  description: {
    confirmed: 'The description is confirmed live on the Google profile.',
    pending: 'Submitted to Google, but the profile is not showing the new text yet (Google may still be processing or reviewing it). Check again shortly.',
    readFail: 'Saved to Google, but the read-back to confirm failed. Open the live profile and verify it shows the new text.',
  },
  hours: {
    confirmed: 'The hours are confirmed live on the Google profile.',
    pending: 'Submitted to Google, but the profile is not showing the new hours yet (Google may still be processing or reviewing them). Check again shortly.',
    readFail: 'Saved to Google, but the read-back to confirm failed. Open the live profile and verify it shows the new hours.',
  },
  website: {
    confirmed: 'The website link is confirmed live on the Google profile.',
    pending: 'Submitted to Google, but the profile is not showing the new website link yet (Google may still be processing or reviewing it). Check again shortly.',
    readFail: 'Saved to Google, but the read-back to confirm failed. Open the live profile and verify it shows the new website link.',
  },
  phone: {
    confirmed: 'The phone number is confirmed live on the Google profile.',
    pending: 'Submitted to Google, but the profile is not showing the new phone number yet (Google may still be processing or reviewing it). Check again shortly.',
    readFail: 'Saved to Google, but the read-back to confirm failed. Open the live profile and verify it shows the new phone number.',
  },
  attributes: {
    confirmed: 'The listing options are confirmed live on the Google profile.',
    pending: 'Submitted to Google, but the profile is not showing the new answers yet (Google may still be processing or reviewing them). Check again shortly.',
    readFail: 'Saved to Google, but the read-back to confirm failed. Open the live profile and verify it shows the new answers.',
  },
}

/* ── Injectable collaborators ── */

export interface FieldWriteDeps {
  getToken: (clientId: string) => Promise<{ accessToken: string; v4Path: string } | { error: string }>
  countAssignedLocations: (clientId: string) => Promise<number>
  acquireSlot: (locationKey: string) => Promise<boolean>
  updateListing: (clientId: string, patch: ListingFields) => Promise<{ ok: true } | { ok: false; error: string }>
  getListing: (clientId: string) => Promise<Awaited<ReturnType<typeof getClientListing>>>
  /** Attributes rail (kind 'attributes'). Optional so existing callers that
   *  inject only the listing collaborators keep compiling; defaults are the
   *  real v1 attribute helpers. The PATCH is attributeMask-scoped to only
   *  the sent ids, so a save never clears other attributes. */
  updateAttributes?: (clientId: string, values: AttributeValues) => Promise<{ ok: true } | { ok: false; error: string }>
  getAttributes?: (clientId: string) => Promise<{ ok: true; values: AttributeValues } | { ok: false; error: string }>
}

const defaultDeps: FieldWriteDeps = {
  getToken: (clientId) => getActiveTokenForClient(clientId, null),
  countAssignedLocations: async (clientId) => {
    const admin = createAdminClient()
    const { count } = await admin.from('gbp_locations').select('id', { count: 'exact', head: true }).eq('client_id', clientId).eq('status', 'assigned')
    return count ?? 0
  },
  acquireSlot: acquireWriteSlot,
  updateListing: (clientId, patch) => updateClientListing(clientId, patch),
  getListing: (clientId) => getClientListing(clientId, null),
  updateAttributes: (clientId, values) => updateClientAttributes(clientId, values, null),
  getAttributes: (clientId) => getClientAttributes(clientId, null),
}

/** Write ONE supported field to the live profile, with the full honesty pipeline. */
export async function pushFieldWrite(
  clientId: string,
  kind: FieldKind,
  value: unknown,
  deps: FieldWriteDeps = defaultDeps,
): Promise<FieldWriteOutcome> {
  // 1. Validate BEFORE anything else — an invalid value must never burn a rate slot or reach Google.
  const checked = validateField(kind, value)
  if (!checked.ok) return { ok: false, error: checked.error, code: 'invalid' }

  // 2. Resolve the target location. Guard the ambiguous case: a client with multiple assigned GBP
  //    locations would silently write to the default-resolved one, so refuse until targeting is wired.
  const tok = await deps.getToken(clientId)
  if ('error' in tok) return { ok: false, error: `Not connected to Google yet: ${tok.error}`, code: 'not_connected' }
  if ((await deps.countAssignedLocations(clientId)) > 1) {
    return { ok: false, error: 'This client has more than one Google location, so a push could hit the wrong one. Per-location targeting is coming; for now make this edit in the Google dashboard.', code: 'multi_location' }
  }

  // 3. Pace per location (10/min, un-raisable), only now that the write is definitely going out.
  if (!(await deps.acquireSlot(tok.v4Path))) {
    return { ok: false, error: 'Too many Google edits in the last minute for this profile. Wait a moment and push again.', code: 'rate_limited' }
  }

  // 4. Write, then read back and COMPARE. Only a matching read-back earns "live"; anything else is
  //    reported for what it is, so the tool never claims more than Google confirmed.
  //    Attributes write through their own v1 endpoint pair (attributeMask-scoped PATCH +
  //    values re-read) — same gates above, same honesty contract below.
  if (kind === 'attributes') {
    const sentMap = checked.attrs ?? {}
    const updateAttrs = deps.updateAttributes ?? defaultDeps.updateAttributes!
    const getAttrs = deps.getAttributes ?? defaultDeps.getAttributes!
    const res = await updateAttrs(clientId, sentMap)
    if (!res.ok) return { ok: false, error: res.error, code: 'google_error' }
    const live = await getAttrs(clientId)
    if (!live.ok) {
      return { ok: true, summary: KIND_TEXT.attributes.readFail, detail: { sent: checked.sent, readBack: null, verified: false } }
    }
    /* Proof = every sent id now reads the sent value. A missing id (Google
       dropped it) or a flipped value is a mismatch, never claimed live. */
    const readMap: Record<string, boolean | null> = {}
    let allMatch = true
    for (const id of Object.keys(sentMap)) {
      const got = Object.prototype.hasOwnProperty.call(live.values, id) ? live.values[id] : null
      readMap[id] = got
      if (got !== sentMap[id]) allMatch = false
    }
    const readBack = JSON.stringify(readMap)
    return allMatch
      ? { ok: true, summary: KIND_TEXT.attributes.confirmed, detail: { sent: checked.sent, readBack, verified: true } }
      : { ok: true, summary: KIND_TEXT.attributes.pending, detail: { sent: checked.sent, readBack, verified: false } }
  }

  const res = await deps.updateListing(clientId, checked.patch)
  if (!res.ok) return { ok: false, error: res.error, code: 'google_error' }
  const live = await deps.getListing(clientId)
  if (!live.ok) {
    return { ok: true, summary: KIND_TEXT[kind].readFail, detail: { sent: checked.sent, readBack: null, verified: false } }
  }
  const readBack = readBackFor(kind, live.fields)
  return readBackMatches(kind, checked, live.fields)
    ? { ok: true, summary: KIND_TEXT[kind].confirmed, detail: { sent: checked.sent, readBack, verified: true } }
    : { ok: true, summary: KIND_TEXT[kind].pending, detail: { sent: checked.sent, readBack, verified: false } }
}

export type { HoursDayInput, AttributeWriteItem }
