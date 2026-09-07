import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { createAdminClient } from '@/lib/supabase/admin'
import { referralsEnabled } from '@/lib/referral-gate'
import { ensureReferralCode } from '@/lib/referrals/server'

/**
 * POST /api/referrals/featured — "Show my page" on or off.
 * Body: { clientId, on }.
 *
 * The default is OFF and it is stored on the client row (migration 261). /owners/<slug> is a 404
 * until this says true, so a public page about a real business only ever exists because its owner
 * tapped a switch.
 */
export async function POST(req: NextRequest) {
  if (!referralsEnabled()) return NextResponse.json({ error: 'closed' }, { status: 503 })
  const body = await req.json().catch(() => ({}))
  const clientId = typeof body.clientId === 'string' ? body.clientId : ''
  const on = body.on === true
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })
  const access = await checkClientAccess(clientId)
  if (!access.authorized) {
    return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status: access.reason === 'unauthenticated' ? 401 : 403 })
  }
  // THE CODE IS MADE HERE, not on the public page. Turning the page on is a deliberate act by the
  // owner; a stranger loading /owners/<slug> is not, and that GET must not write anything.
  // Best-effort: a page with no code still draws, it just shows the plain invitation.
  if (on) await ensureReferralCode(clientId)
  const { error } = await createAdminClient().from('clients').update({ featured_opt_in: on }).eq('id', clientId)
  if (error) {
    console.warn('[referrals] could not save the opt-in (apply migration 261?):', error.message)
    return NextResponse.json({ error: 'Could not save. Try again.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, on })
}
