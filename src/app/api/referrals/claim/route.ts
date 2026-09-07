import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { referralsEnabled } from '@/lib/referral-gate'
import { claimReferral } from '@/lib/referrals/server'

/**
 * POST /api/referrals/claim — a friend finished setup with ?ref=<code> on.
 * Body: { code }.
 *
 * WHO THE CLIENT IS IS NOT TAKEN FROM THE BODY. The caller is the person who just finished
 * onboarding, and the client this referral is written against is resolved from their own signed-in
 * session — otherwise anyone could post any clientId and mint a $50 credit onto an account that is
 * not theirs.
 *
 * Best-effort by design: onboarding calls it and ignores the answer beyond the friend's name.
 * A referral that cannot be written must never stop somebody finishing setup.
 */
export async function POST(req: NextRequest) {
  if (!referralsEnabled()) return NextResponse.json({ ok: false, reason: 'closed' })
  const body = await req.json().catch(() => ({}))
  const code = typeof body.code === 'string' ? body.code : ''
  if (!code) return NextResponse.json({ ok: false, reason: 'no code' })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })

  // The client this person owns. Both linkage paths, the same two the portal itself resolves on
  // (client_users for a portal login, businesses for the owner who signed up).
  const admin = createAdminClient()
  const [cu, biz] = await Promise.all([
    admin.from('client_users').select('client_id').eq('auth_user_id', user.id).limit(1).maybeSingle(),
    admin.from('businesses').select('client_id').eq('owner_id', user.id).limit(1).maybeSingle(),
  ])
  const clientId = (cu.data?.client_id as string) || (biz.data?.client_id as string) || ''
  if (!clientId) return NextResponse.json({ ok: false, reason: 'no account yet' })

  const result = await claimReferral(code, clientId)
  return NextResponse.json(result)
}
