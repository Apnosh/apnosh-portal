/**
 * POST /api/dashboard/wins/unshare  { clientId, cardKey }  →  { down }
 *
 * Takes a win's public page down. The token is set back to null, so /w/<token> stops finding
 * anything and the address is gone for good — it is never handed to another card (the unique
 * index in migration 260 is partial, and a fresh Share mints a new one).
 *
 * This is the leg that makes the public page's own words true. It says a link may have been "cut
 * short, or the card was taken down", and until now nothing could take one down: an owner who
 * shared a number and then thought better of it had no way back, and staff would have had to run
 * SQL. A share that cannot be undone is not really the owner's to give.
 *
 * Same door as sharing (src/app/api/dashboard/wins/share/route.ts): the person has to be able to
 * read this client. No win check here on purpose — a card that stopped qualifying as a win must
 * still be takeable down.
 *
 * Best-effort before migration 260: no share_token column means there is nothing to take down, and
 * the answer says so rather than failing.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { userMayReadClient } from '@/lib/auth/client-access'
import { isStaffRole } from '@/lib/auth/roles'

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
  const isAdmin = isStaffRole((profile as { role?: string } | null)?.role)
  if (!isAdmin && !(await userMayReadClient(user.id, clientId))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('proof_cards')
    .update({ share_token: null })
    .eq('client_id', clientId)
    .eq('card_key', cardKey)

  if (error) {
    // No column yet (42703, before 260) or no table (42P01, before 249): there is no public page
    // to take down, which is the answer the button wanted.
    if (error.code === '42703' || error.code === '42P01' || error.code === 'PGRST205') {
      console.warn('[wins/unshare] share_token is missing; apply migration 260')
      return NextResponse.json({ down: true, pending: 'migration 260' })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ down: true })
}
