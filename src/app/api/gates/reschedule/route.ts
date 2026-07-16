/**
 * POST /api/gates/reschedule — the client moves their own shoot to a new open slot (Checkout Gates,
 * Phase 3). Allowed while the current slot is outside the 3-business-day window (or the booking is
 * needs_reschedule); inside the window it routes to staff instead (200 with needsStaff:true, honest).
 * Tenancy-gated.
 */
import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { clientReschedule } from '@/lib/campaigns/gates/booking-server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const clientId = body.clientId as string | undefined
  const bookingId = body.bookingId as string | undefined
  const date = body.date as string | undefined
  const start = body.start as string | undefined
  if (!clientId || !bookingId || !date || !start) {
    return NextResponse.json({ error: 'clientId, bookingId, date, start required' }, { status: 400 })
  }
  const access = await checkClientAccess(clientId)
  if (!access.authorized) {
    return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status: access.reason === 'unauthenticated' ? 401 : 403 })
  }

  const result = await clientReschedule({ bookingId, clientId, date, start })
  if (result.ok) return NextResponse.json({ ok: true, slot: { date: result.date, start: result.start }, label: result.label })
  // The "too close → staff will handle it" outcome is not an error to the owner — it's the honest
  // answer, returned 200 so the UI shows the reassurance instead of a red failure.
  if (result.code === 'needs_staff') return NextResponse.json({ ok: false, needsStaff: true, message: result.error })
  const status = result.code === 'slot_taken' ? 409 : result.code === 'forbidden' ? 403 : result.code === 'not_found' || result.code === 'no_rule' ? 404 : 400
  return NextResponse.json({ error: result.error, code: result.code }, { status })
}
