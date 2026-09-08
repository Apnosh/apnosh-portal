import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { referralsEnabled } from '@/lib/referral-gate'
import { settledCentsFor, retirePriorCheckout } from '@/lib/referrals/server'

/**
 * /api/referrals/admin — the staff view of the loop, and the one way to kill a referral by hand.
 *
 * GET  → every code, every referral and every credit, newest first, with the business names filled
 *        in. Read only.
 * POST → { referralId, reason } voids a referral AND whatever is unspent of its credits.
 *
 * WHAT "UNSPENT" MEANS. Not "consumed_at is null" — that field is stamped the moment a checkout
 * HOLDS a credit, so a credit sitting in an abandoned tab looked spent and survived the void; a
 * fraud ring only had to open checkout to keep its $50. Spent means the payments ledger has a
 * collected order that took the money. Nothing collected, the credit dies. Something collected,
 * only what is LEFT dies: the credit is written down to the amount that really came off a bill.
 *
 * AN OPEN CHECKOUT IS SHUT FIRST. The intent behind it already has the discount in its amount, so
 * a credit voided while its checkout is still payable is a discount off a credit that is gone. The
 * intent is cancelled at Stripe before the credit dies; a credit whose checkout will not cancel is
 * left alone and counted in creditsStuck.
 *
 * A SPENT CREDIT IS NEVER TAKEN BACK, here or anywhere. If a referral we should not have paid has
 * already come off a bill the owner paid, that money is theirs; the void stops the rest. Staff who
 * need to reverse a paid discount do it as a charge, with a person deciding, not a route.
 */
async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, status: 401 }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'admin' && profile?.role !== 'super_admin') return { ok: false as const, status: 403 }
  return { ok: true as const, userId: user.id }
}

export async function GET() {
  const gate = await requireAdmin()
  if (!gate.ok) return NextResponse.json({ error: 'forbidden' }, { status: gate.status })
  const admin = createAdminClient()
  try {
    const [codes, referrals, credits] = await Promise.all([
      admin.from('referral_codes').select('client_id, code, created_at').order('created_at', { ascending: false }).limit(500),
      admin.from('referrals').select('*').order('created_at', { ascending: false }).limit(500),
      admin.from('client_credits').select('*').order('created_at', { ascending: false }).limit(500),
    ])
    const ids = new Set<string>()
    for (const r of (codes.data ?? []) as { client_id: string }[]) ids.add(r.client_id)
    for (const r of (referrals.data ?? []) as { referrer_client_id: string; referred_client_id: string }[]) { ids.add(r.referrer_client_id); ids.add(r.referred_client_id) }
    for (const r of (credits.data ?? []) as { client_id: string }[]) ids.add(r.client_id)
    const names: Record<string, string> = {}
    if (ids.size) {
      const { data } = await admin.from('clients').select('id, name').in('id', [...ids])
      for (const c of (data ?? []) as { id: string; name: string }[]) names[c.id] = c.name
    }
    return NextResponse.json({
      enabled: referralsEnabled(),
      codes: codes.data ?? [],
      referrals: referrals.data ?? [],
      credits: credits.data ?? [],
      names,
    })
  } catch (e) {
    // Pre-261 the tables are not there. Say so plainly instead of an empty page that looks broken.
    return NextResponse.json({ enabled: referralsEnabled(), codes: [], referrals: [], credits: [], names: {}, note: e instanceof Error ? e.message : 'not set up' })
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireAdmin()
  if (!gate.ok) return NextResponse.json({ error: 'forbidden' }, { status: gate.status })
  const body = await req.json().catch(() => ({}))
  const referralId = typeof body.referralId === 'string' ? body.referralId : ''
  const reason = (typeof body.reason === 'string' ? body.reason : '').trim()
  if (!referralId) return NextResponse.json({ error: 'referralId required' }, { status: 400 })
  // A void with no reason is a mystery in a ledger six months from now.
  if (!reason) return NextResponse.json({ error: 'Say why. It goes in the ledger.' }, { status: 400 })
  const admin = createAdminClient()
  const now = new Date().toISOString()
  try {
    const { error } = await admin.from('referrals')
      .update({ status: 'void', voided_at: now, void_reason: reason })
      .eq('id', referralId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    // Only what is UNSPENT — and the ledger, not the credit row, is what says so.
    const { data: rows } = await admin.from('client_credits')
      .select('id, cents, consumed_intent_id')
      .eq('referral_id', referralId)
      .is('voided_at', null)
    let creditsVoided = 0, creditsTrimmed = 0, creditsStuck = 0
    for (const c of (rows ?? []) as { id: string; cents: number; consumed_intent_id: string | null }[]) {
      const settled = await settledCentsFor(c.id)
      // Unreadable: leave it alone rather than kill a credit an owner may have already spent.
      if (settled == null) continue
      // AN OPEN CHECKOUT IS SHUT BEFORE THE CREDIT DIES. The PaymentIntent behind it was created
      // with this discount already inside its amount, so voiding the credit while that intent is
      // still payable means the owner pays the discounted number off a credit that no longer
      // exists. If it cannot be shut — it is processing, already paid, or Stripe would not answer
      // — this credit is left exactly as it is and the void is reported as incomplete.
      if (c.consumed_intent_id && !await retirePriorCheckout(c.consumed_intent_id)) { creditsStuck += 1; continue }
      if (settled <= 0) {
        const { data } = await admin.from('client_credits')
          .update({ voided_at: now, void_reason: reason, held_cents: 0, consumed_intent_id: null })
          .eq('id', c.id).is('voided_at', null).select('id')
        if (data?.length) creditsVoided += 1
      } else if (settled < (c.cents || 0)) {
        // Part of it already came off a bill somebody paid. That part is theirs; the rest is not.
        const { data } = await admin.from('client_credits')
          .update({ cents: settled, consumed_cents: settled, held_cents: 0, consumed_intent_id: null, void_reason: reason })
          .eq('id', c.id).is('voided_at', null).select('id')
        if (data?.length) creditsTrimmed += 1
      }
    }
    // creditsStuck is the honest half of the answer: those credits are still live because their
    // open checkout could not be shut. Try again once it settles.
    return NextResponse.json({ ok: true, creditsVoided, creditsTrimmed, creditsStuck })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not void it.' }, { status: 500 })
  }
}
