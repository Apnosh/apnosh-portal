import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { referralsEnabled } from '@/lib/referral-gate'
import { referralStateFor } from '@/lib/referrals/server'

/**
 * GET /api/referrals/me?clientId=… — the owner's own referral state: their code, the friends they
 * sent and where each one is, and the credit sitting on their account.
 *
 * THE SWITCH IS CHECKED HERE, on the server, before anything is read. With it off the answer is
 * `{ enabled: false }` and the Home card and the page both draw nothing — hiding a button is not
 * what keeps this shut.
 *
 * The eligibility rule (one counted promise) is enforced in referralStateFor, not in the screen,
 * for the same reason.
 */
export async function GET(req: NextRequest) {
  const clientId = new URL(req.url).searchParams.get('clientId') ?? ''
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })
  if (!referralsEnabled()) return NextResponse.json({ enabled: false, eligible: false })
  const access = await checkClientAccess(clientId)
  if (!access.authorized) {
    return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status: access.reason === 'unauthenticated' ? 401 : 403 })
  }
  const state = await referralStateFor(clientId)
  return NextResponse.json(state)
}
