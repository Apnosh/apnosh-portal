/**
 * GET /api/dashboard/pulse?clientId=...
 * Returns the three pulse cards (Customers, Reputation, Reach) ready
 * to render. Server-side computes both "live" and "no-data" states so
 * the dashboard never alarms on missing connections.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getPulseData } from '@/lib/dashboard/get-pulse-data'

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, client_id')
    .eq('id', user.id)
    .maybeSingle()
  let authorized = profile?.role === 'admin' || profile?.client_id === clientId
  if (!authorized) {
    const { data: membership } = await supabase
      .from('client_users')
      .select('client_id')
      .eq('user_id', user.id)
      .eq('client_id', clientId)
      .maybeSingle()
    if (membership) authorized = true
  }
  if (!authorized) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const data = await getPulseData(clientId)
  return NextResponse.json(data)
}
