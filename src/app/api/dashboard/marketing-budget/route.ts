import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/dashboard/marketing-budget returns the signed-in owner's monthly marketing
 * budget (businesses.monthly_budget, the one they set in /dashboard/profile).
 * Used by the create flow as a soft spend cap: it warns when the running
 * monthly total would go over. RLS scopes the read to the owner's own business.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ monthlyBudget: null })
  const { data } = await supabase
    .from('businesses')
    .select('monthly_budget')
    .eq('owner_id', user.id)
    .maybeSingle()
  const mb = (data as { monthly_budget?: number | string | null } | null)?.monthly_budget
  const n = mb != null ? Number(mb) : null
  return NextResponse.json({ monthlyBudget: n != null && Number.isFinite(n) && n > 0 ? Math.round(n) : null })
}
