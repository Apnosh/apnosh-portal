/**
 * GET /api/dashboard/promises?clientId=…  →  { rows: PromiseRow[] }
 *
 * The "Counted, as promised" strip on Home: one row per order, the count the card named, the
 * day it started, the number before. Read always; empty when the client has no orders.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPromiseRows, getDeskOrders } from '@/lib/promises/read'

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
  const all = new URL(req.url).searchParams.get('all') === '1'
  try {
    if (all) {
      // The Campaigns feed: every ledger row (for the card line) + desk orders (which have no
      // campaign row). Each is best-effort so a missing table never empties the other.
      const [rows, desk] = await Promise.all([getPromiseRows(clientId, 0).catch(() => []), getDeskOrders(clientId).catch(() => [])])
      const byReq = new Map(rows.filter((r) => r.requestId).map((r) => [r.requestId as string, r.line]))
      return NextResponse.json({ rows, desk: desk.map((d) => ({ ...d, line: byReq.get(d.id) ?? null })) })
    }
    const rows = await getPromiseRows(clientId, 3)
    return NextResponse.json({ rows })
  } catch (e) {
    // Pre-migration-253 (42P01) or any read hiccup: the strip simply does not render.
    console.warn('[promises] read failed', (e as Error)?.message)
    return NextResponse.json({ rows: [] })
  }
}
