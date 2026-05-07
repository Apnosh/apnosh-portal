/**
 * GET /api/dashboard/weekly?clientId=...
 * Returns the past-7-days marketing activity for the dashboard's
 * "Your marketing this week" card. Wrapper around the server-only
 * helper getWeeklyActivity so the client component can fetch it.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getWeeklyActivity } from '@/lib/dashboard/get-weekly-activity'

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

  if (profile?.role !== 'admin' && profile?.client_id !== clientId) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const activity = await getWeeklyActivity(clientId)
  return NextResponse.json(activity)
}
