/**
 * POST /api/gates/request — record an honest REQUEST-MODE booking (Checkout Gates, Phase 3). Called by
 * the checkout when a shoot campaign has no published availability: instead of a fake slot, we track a
 * 'requested' booking bound to the PaymentIntent and let staff schedule it later. Tenancy-gated.
 * Degrades silently (ok:false) if migration 219 isn't applied — the checkout still shows its note.
 */
import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { createClient } from '@/lib/supabase/server'
import { requestBooking } from '@/lib/campaigns/gates/booking-server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const clientId = body.clientId as string | undefined
  const paymentIntentId = body.paymentIntentId as string | undefined
  const gateKind = (typeof body.gateKind === 'string' ? body.gateKind : 'shoot').slice(0, 40)
  if (!clientId || !paymentIntentId) return NextResponse.json({ error: 'clientId, paymentIntentId required' }, { status: 400 })

  const access = await checkClientAccess(clientId)
  if (!access.authorized) {
    return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status: access.reason === 'unauthenticated' ? 401 : 403 })
  }
  let createdBy: string | null = null
  try { const sb = await createClient(); createdBy = (await sb.auth.getUser()).data.user?.id ?? null } catch { /* provenance only */ }

  const r = await requestBooking({ clientId, paymentIntentId, gateKind, createdBy })
  return NextResponse.json({ ok: r.ok, ...(r.code ? { code: r.code } : {}) })
}
