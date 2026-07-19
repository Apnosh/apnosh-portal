/**
 * POST /api/admin/bookings/[id] — admin actions on a booking (Checkout Gates, Phase 3).
 *   { action: 'needs_reschedule', reason? } → mark a confirmed booking as needing a new date: block the
 *      shoot work orders + notify the owner to pick a new day.
 *   { action: 'assign', date, start }       → assign/move the booking to a real open slot (resolve a
 *      needs_reschedule or a request-mode 'requested' row), re-seed + unblock, notify the owner.
 * Admin-only (same role check as the other /api/admin routes); writes via the service-role helpers.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminSetNeedsReschedule, assignBookingSlot } from '@/lib/campaigns/gates/booking-server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

async function requireAdmin(): Promise<{ userId: string } | NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'not authenticated' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  return { userId: user.id }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const action = body.action as string | undefined

  if (action === 'needs_reschedule') {
    const r = await adminSetNeedsReschedule(id, typeof body.reason === 'string' ? body.reason.slice(0, 300) : '')
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'assign') {
    const date = body.date as string | undefined
    const start = body.start as string | undefined
    if (!date || !start) return NextResponse.json({ error: 'date, start required' }, { status: 400 })
    const r = await assignBookingSlot({ bookingId: id, date, start, notify: 'client' })
    if (!r.ok) {
      const status = r.code === 'slot_taken' ? 409 : r.code === 'not_found' || r.code === 'no_rule' ? 404 : 400
      return NextResponse.json({ error: r.error, code: r.code }, { status })
    }
    return NextResponse.json({ ok: true, slot: { date: r.date, start: r.start }, label: r.label })
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 })
}
