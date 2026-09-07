/**
 * POST /api/dashboard/wins/share  { clientId, cardKey }  →  { url, token }
 *
 * Gives one win a public address, and remembers that the owner shared it.
 *
 * MINTED ONCE, NEVER ROTATED. The token is claimed with `where share_token is null`, so two taps
 * on Share (a double tap, two devices) cannot mint two addresses for the same card — the loser
 * re-reads the winner's token and both get the same link. A link an owner already sent somebody
 * must not stop working because they tapped Share again.
 *
 * ONLY A WIN GETS ONE. The rules live in src/lib/love/win.ts: the card has to be stored, mint by
 * the same table the deck reads, and carrying a real number. A heads-up ("a quieter week") and a
 * state card ("connect Google") have no public page at all — there is no URL to leak, because
 * none is ever made.
 *
 * Best-effort before migration 260: a missing share_token column answers { url: null, pending }
 * and the button falls back to what it can do (the owner still has the card on their own screen).
 * A mark is never worth a 500.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { userMayReadClient } from '@/lib/auth/client-access'
import { isWin, newShareToken } from '@/lib/love/win'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { clientId?: string; cardKey?: string } | null
  const clientId = body?.clientId ?? ''
  const cardKey = body?.cardKey ?? ''
  if (!clientId || !cardKey) return NextResponse.json({ error: 'clientId and cardKey required' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  const isAdmin = !!profile && ['admin', 'super_admin'].includes((profile as { role: string }).role)
  if (!isAdmin && !(await userMayReadClient(user.id, clientId))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const admin = createAdminClient()
  const { data: row, error } = await admin
    .from('proof_cards')
    .select('id, card_key, card_type, big, share_token')
    .eq('client_id', clientId)
    .eq('card_key', cardKey)
    .maybeSingle()

  // No column yet (42703, before 260) or no table (42P01, before 249): nothing to mint, and the
  // owner keeps the card on their own screen.
  if (error) {
    if (error.code === '42703' || error.code === '42P01' || error.code === 'PGRST205') {
      console.warn('[wins/share] share_token is missing; apply migration 260')
      return NextResponse.json({ url: null, pending: 'migration 260' })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!row) return NextResponse.json({ error: 'no such card' }, { status: 404 })
  if (!isWin({ cardKey: String(row.card_key), cardType: String(row.card_type), big: String(row.big) })) {
    return NextResponse.json({ error: 'that card is not a win' }, { status: 400 })
  }

  let token = (row.share_token as string | null) ?? null
  if (!token) {
    const fresh = newShareToken()
    const { data: claimed } = await admin
      .from('proof_cards')
      .update({ share_token: fresh })
      .eq('id', row.id)
      .is('share_token', null)
      .select('share_token')
    if (claimed && claimed.length > 0) {
      token = fresh
    } else {
      // Somebody else minted it a moment ago. Read theirs — the link the owner already sent has
      // to keep working.
      const { data: again } = await admin.from('proof_cards').select('share_token').eq('id', row.id).maybeSingle()
      token = (again?.share_token as string | null) ?? null
    }
  }

  // They sent it somewhere. Best-effort: the mark is for the staff love table, not for the owner.
  const { error: markErr } = await admin
    .from('proof_cards')
    .update({ shared_at: new Date().toISOString() })
    .eq('id', row.id)
  if (markErr && markErr.code !== '42703') {
    console.warn('[wins/share] could not stamp shared_at:', markErr.message)
  }

  if (!token) return NextResponse.json({ url: null, pending: 'migration 260' })
  return NextResponse.json({ token, url: `/w/${token}` })
}
