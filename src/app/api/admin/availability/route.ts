/**
 * /api/admin/availability — admin CRUD for published availability_rules (Checkout Gates, Phase 1).
 *   GET  -> { rules } every rule, newest first (drafts + active)
 *   POST -> create one; body is the rule shape (validate.ts clamps + cleans it)
 * Admin-only (same role check as the other /api/admin routes); writes via the service-role client.
 * A missing table (migration 218 not applied) returns a clear setup error, never a 500 stack.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAllGateRules } from '@/lib/campaigns/gates/availability-server'
import { validateRule } from './validate'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const SETUP_MSG = 'Availability isn’t set up yet. Apply migration 218 in Supabase and try again.'

async function requireAdmin(): Promise<{ userId: string } | NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'not authenticated' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  return { userId: user.id }
}

export async function GET() {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const rules = await getAllGateRules()
  return NextResponse.json({ rules }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const v = validateRule(await req.json().catch(() => null))
  if ('error' in v) return NextResponse.json({ error: v.error }, { status: 400 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('availability_rules')
    .insert({ ...v.payload, created_by: auth.userId, updated_at: new Date().toISOString() })
    .select('*')
    .maybeSingle()
  if (error) {
    if (error.code === '42P01') return NextResponse.json({ error: SETUP_MSG }, { status: 400 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ rule: data }, { status: 201 })
}
