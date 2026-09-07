/**
 * GET /api/dashboard/love?clientId=…  →  { weeksActiveOfLast4, winsOpenedOfLast30, sentence }
 *
 * The love read: does this owner come back, do the wins we fire get looked at, and what is the
 * one true sentence about their week. Read always; every part is best-effort underneath, so a
 * missing table answers 0 / null instead of an error.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { weeksActiveOfLast4, winsOpenedOfLast30 } from '@/lib/love/metrics'
import { weeklySentence } from '@/lib/love/sentence'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const clientId = new URL(req.url).searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  const isAdmin = !!profile && ['admin', 'super_admin'].includes((profile as { role: string }).role)
  if (!isAdmin) {
    const { data: cu } = await createAdminClient().from('client_users').select('client_id').eq('auth_user_id', user.id).eq('client_id', clientId).maybeSingle()
    if (!cu) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const [weeks, wins, sentence] = await Promise.all([
    weeksActiveOfLast4(clientId),
    winsOpenedOfLast30(clientId),
    weeklySentence(clientId).catch(() => null),
  ])
  return NextResponse.json(
    { weeksActiveOfLast4: weeks, winsOpenedOfLast30: wins, sentence },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
