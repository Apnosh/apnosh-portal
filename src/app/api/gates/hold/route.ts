/**
 * POST /api/gates/hold — hold a slot for the client's in-progress checkout (Checkout Gates, Phase 2).
 * Body: { clientId, paymentIntentId, gateKind, date, start }. Creates/replaces a 30-min HELD booking
 * bound to the PaymentIntent, but only for a slot the live engine says is open (else 409 slot_taken).
 * The hold is confirmed later, at /api/checkout/complete, once the charge clears. Tenancy-gated.
 */
import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { createClient } from '@/lib/supabase/server'
import { holdBooking } from '@/lib/campaigns/gates/booking-server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const clientId = body.clientId as string | undefined
  const paymentIntentId = body.paymentIntentId as string | undefined
  const gateKind = (typeof body.gateKind === 'string' ? body.gateKind : 'shoot').slice(0, 40)
  const date = body.date as string | undefined
  const start = body.start as string | undefined
  if (!clientId || !paymentIntentId || !date || !start) {
    return NextResponse.json({ error: 'clientId, paymentIntentId, date, start required' }, { status: 400 })
  }

  const access = await checkClientAccess(clientId)
  if (!access.authorized) {
    return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status: access.reason === 'unauthenticated' ? 401 : 403 })
  }

  // The acting user (for created_by provenance); tenancy already enforced above.
  let createdBy: string | null = null
  try { const sb = await createClient(); createdBy = (await sb.auth.getUser()).data.user?.id ?? null } catch { /* provenance only */ }

  const result = await holdBooking({ clientId, paymentIntentId, gateKind, date, start, createdBy })
  if (!result.ok) {
    const status = result.code === 'slot_taken' ? 409 : result.code === 'no_rule' ? 404 : 400
    return NextResponse.json({ error: result.error, code: result.code }, { status })
  }
  return NextResponse.json({
    bookingId: result.bookingId,
    holdExpiresAt: result.holdExpiresAt,
    slot: { date: result.date, start: result.start, end: result.end, timezone: result.timezone },
  })
}
