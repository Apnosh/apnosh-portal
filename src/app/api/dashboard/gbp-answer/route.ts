/**
 * POST /api/dashboard/gbp-answer  { clientId, questionId, text }
 *
 * Writes (or replaces) THE merchant answer on one customer question on the
 * client's live Google listing, via the My Business Q&A answers:upsert
 * endpoint (src/lib/gbp-qanda.ts upsertGbpAnswer).
 *
 * Gates, in order (same pattern as the sibling gbp-apply route):
 *   1. checkClientAccess — signed-in user must be linked to the client
 *   2. isProTier — 403 for non-Pro plans (server-enforced, never UI-only)
 *   3. deterministic validation (400 before anything touches Google)
 *   4. upsertGbpAnswer — per-location rate slot (429), POST upsert, then a
 *      read-back of that question to confirm the merchant answer matches.
 *
 * Response is HONEST — never 200 with a fake success:
 *   200 { ok: true, live: boolean, message: string }
 *       live:true ONLY when the read-back matched what was sent.
 *   4xx/5xx { ok: false, error: string } — plain owner words only.
 */

import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { createAdminClient } from '@/lib/supabase/admin'
import { isProTier } from '@/lib/entitlements'
import { upsertGbpAnswer, validateAnswer, validQuestionId } from '@/lib/gbp-qanda'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

function denied(reason: string | undefined) {
  return NextResponse.json({ error: reason ?? 'forbidden' }, { status: reason === 'unauthenticated' ? 401 : 403 })
}

export async function POST(req: NextRequest) {
  let body: { clientId?: unknown; questionId?: unknown; text?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'clientId required' }, { status: 400 })
  }
  const clientId = typeof body.clientId === 'string' && body.clientId ? body.clientId : null
  if (!clientId) return NextResponse.json({ ok: false, error: 'clientId required' }, { status: 400 })

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
    return NextResponse.json({ error: 'Answering from here is on the Pro plan.' }, { status: 403 })
  }

  // Gate 3: deterministic validation — a bad value is a 400 before anything touches Google.
  const checked = validateAnswer(body.text)
  if (!checked.ok) return NextResponse.json({ ok: false, error: checked.error }, { status: 400 })
  if (!validQuestionId(body.questionId)) {
    return NextResponse.json({ ok: false, error: 'That question could not be found. Reload and try again.' }, { status: 400 })
  }

  // Gate 4: the honest write pipeline (rate slot, upsert, read-back proof).
  const result = await upsertGbpAnswer(clientId, body.questionId, checked.value)
  if (!result.ok) {
    if (result.code === 'rate_limited') {
      return NextResponse.json({ ok: false, error: 'Google only allows a few edits per minute. Try again in a minute.' }, { status: 429 })
    }
    const status = result.code === 'invalid' ? 400 : 502
    return NextResponse.json({ ok: false, error: result.error }, { status })
  }

  // ok:true means Google accepted the write; live is true ONLY when the read-back matched.
  return NextResponse.json({ ok: true, live: result.live, message: result.summary })
}
