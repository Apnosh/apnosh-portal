import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { referralsEnabled } from '@/lib/referral-gate'

/**
 * /api/referrals/admin — the staff view of the loop, and the one way to kill a referral by hand.
 *
 * GET  → every code, every referral and every credit, newest first, with the business names filled
 *        in. Read only.
 * POST → { referralId, reason } voids a referral AND whatever is unspent of its credits.
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
    // Only what is UNSPENT. consumed_at is null is the whole of that rule.
    const { data: killed } = await admin.from('client_credits')
      .update({ voided_at: now, void_reason: reason })
      .eq('referral_id', referralId)
      .is('consumed_at', null)
      .is('voided_at', null)
      .select('id')
    return NextResponse.json({ ok: true, creditsVoided: killed?.length ?? 0 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not void it.' }, { status: 500 })
  }
}
