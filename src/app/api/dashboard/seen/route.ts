/**
 * POST /api/dashboard/seen  { clientId }  →  { ok: true }
 *
 * One line in the owner's session log: today's row, or one more screen on it. Called by the
 * shell on every screen change (throttled there to one call per screen), so this is the ONE
 * place the product learns that an owner actually shows up.
 *
 * Best-effort by design: pre-migration-257 the function does not exist, the write fails, and
 * this still answers ok — a missing log must never break a screen.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { userMayReadClient } from '@/lib/auth/client-access'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { clientId?: string } | null
  const clientId = body?.clientId ?? ''
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  const isAdmin = !!profile && ['admin', 'super_admin'].includes((profile as { role: string }).role)
  if (!isAdmin && !(await userMayReadClient(user.id, clientId))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  // Staff looking at a client's screens are not that client's owner showing up, so their
  // visits stay out of the log — otherwise every "weeks active" number counts us.
  if (isAdmin) return NextResponse.json({ ok: true, skipped: 'staff' })

  try {
    const { error } = await createAdminClient().rpc('owner_seen', { p_client_id: clientId, p_user_id: user.id })
    if (error) console.warn('[seen] log failed', error.message)
  } catch (e) {
    console.warn('[seen] log failed', (e as Error)?.message)
  }
  return NextResponse.json({ ok: true })
}
