/**
 * GET /api/gates/availability?gateKind=shoot — the open slots a client may pick for a pre-checkout
 * gate (scheduling first). Availability is catalog-wide, not client-specific, so the auth check is
 * just "signed in" (same as /api/dashboard/catalog-content). Returns honest request-mode
 * ({ available:false, reason:'no_availability' }) when nothing is published or migration 218 isn't
 * applied — never a fabricated slot. Phase 2 adds the hold endpoint that turns a pick into a booking.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOpenSlots } from '@/lib/campaigns/gates/availability-server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 10

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })

  const gateKind = (req.nextUrl.searchParams.get('gateKind') || 'shoot').slice(0, 40)
  const result = await getOpenSlots(gateKind)
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
}
