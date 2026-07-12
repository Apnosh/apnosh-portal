/**
 * POST /api/dashboard/gbp-apply  { clientId, kind, value }
 *
 * The owner-facing "Save to Google" rail: writes ONE supported Google Business
 * Profile field to the LIVE listing, on the same honesty engine the admin
 * work-order path uses (gbp-apply/fields.ts pushFieldWrite).
 *
 * kinds + value shapes:
 *   - description : string (Google's rules: ≤750 chars, no URLs/emails/phones)
 *   - website     : string (https:// URL)
 *   - phone       : string (10–15 digits, phone punctuation only)
 *   - hours       : HoursDayInput[] — ALL 7 days, e.g.
 *                   [{ day: 'MONDAY', closed: false, open: '11:00', close: '21:00' }, ...]
 *                   The save REPLACES the whole weekly schedule, so the UI must send the
 *                   full week (validated). One open range per day in v1.
 *   - attributes  : Array<{ id: string, value: boolean }> — 1-20 yes/no listing
 *                   options (bare attribute ids, e.g. "has_outdoor_seating"). The PATCH
 *                   is attributeMask-scoped to ONLY the sent ids, so other attributes
 *                   on the listing are never cleared. live:true only when a re-read of
 *                   the values shows EVERY sent id at its sent value.
 *
 * Gates, in order (same pattern as the sibling gbp-draft route):
 *   1. checkClientAccess — signed-in user must be linked to the client
 *   2. isProTier — 403 for non-Pro plans (server-enforced, never UI-only)
 *   3. deterministic validation (400 before anything touches Google)
 *   4. pushFieldWrite — multi-location refusal, 10/min per-location rate slot
 *      (surfaced as 429 "try again in a minute"), PATCH, then read-back proof.
 *
 * Response is HONEST — never 200 with a fake success:
 *   200 { ok: true, live: boolean, readBack: string|null, message: string }
 *       live:true ONLY when the read-back matched what was sent.
 *   4xx/5xx { ok: false, error: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { createAdminClient } from '@/lib/supabase/admin'
import { isProTier } from '@/lib/entitlements'
import { pushFieldWrite, validateField, FIELD_KINDS, type FieldKind } from '@/lib/gbp-apply/fields'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

function denied(reason: string | undefined) {
  return NextResponse.json({ error: reason ?? 'forbidden' }, { status: reason === 'unauthenticated' ? 401 : 403 })
}

export async function POST(req: NextRequest) {
  let body: { clientId?: unknown; kind?: unknown; value?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'clientId required' }, { status: 400 })
  }
  const clientId = typeof body.clientId === 'string' && body.clientId ? body.clientId : null
  if (!clientId) return NextResponse.json({ ok: false, error: 'clientId required' }, { status: 400 })
  const kind = body.kind
  if (typeof kind !== 'string' || !(FIELD_KINDS as readonly string[]).includes(kind)) {
    return NextResponse.json({ ok: false, error: `kind must be one of: ${FIELD_KINDS.join(', ')}` }, { status: 400 })
  }

  // Gate 1: the signed-in user must actually be this client.
  const access = await checkClientAccess(clientId)
  if (!access.authorized) return denied(access.reason)

  // Gate 2: Pro plan, enforced at the SERVER (never trust the client UI alone).
  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return NextResponse.json({ ok: false, error: 'Could not save right now. Try again in a minute.' }, { status: 502 })
  }
  const { data: row } = await admin.from('clients').select('tier').eq('id', clientId).maybeSingle()
  if (!isProTier((row as { tier?: string | null } | null)?.tier)) {
    return NextResponse.json({ error: 'Saving to Google is on the Pro plan.' }, { status: 403 })
  }

  // Gate 3: deterministic validation — a bad value is a 400 before anything touches Google.
  const checked = validateField(kind as FieldKind, body.value)
  if (!checked.ok) return NextResponse.json({ ok: false, error: checked.error }, { status: 400 })

  // Gate 4: the honest write pipeline (multi-location refusal, rate slot, PATCH, read-back proof).
  const result = await pushFieldWrite(clientId, kind as FieldKind, body.value)
  if (!result.ok) {
    if (result.code === 'rate_limited') {
      return NextResponse.json({ ok: false, error: 'Google only allows a few profile edits per minute. Try again in a minute.' }, { status: 429 })
    }
    const status = result.code === 'invalid' ? 400 : 502
    return NextResponse.json({ ok: false, error: result.error ?? 'The save did not go through.' }, { status })
  }

  // ok:true means Google accepted the write; live is true ONLY when the read-back matched.
  return NextResponse.json({
    ok: true,
    live: result.detail?.verified === true,
    readBack: result.detail?.readBack ?? null,
    message: result.summary ?? null,
  })
}
