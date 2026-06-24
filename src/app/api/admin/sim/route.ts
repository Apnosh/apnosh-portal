import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { runShipIntegrationSim } from '@/lib/campaigns/sim/ship-integration'

// Admin-only: runs the real ship path (create → materialize → mint → status
// machine) against a throwaway campaign and returns a pass/fail report. Powers
// the /admin/sim button so the lifecycle can be exercised from the browser.
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if ((profile?.role as string | null) !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const report = await runShipIntegrationSim()
  return NextResponse.json(report)
}
