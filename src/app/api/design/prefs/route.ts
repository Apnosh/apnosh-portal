import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/design/prefs — the owner's usual for graphic orders, written by the
 * order rail itself when an order is placed (ask-once law: remembered, never
 * locked). 42703-tolerant until migration 244 runs: any miss returns null.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ prefs: null })
  try {
    const admin = createAdminClient()
    const { data: biz } = await admin
      .from('businesses').select('client_id').eq('owner_id', user.id).maybeSingle()
    let clientId = (biz?.client_id as string | null) ?? null
    if (!clientId) {
      const { data: cu } = await admin
        .from('client_users').select('client_id').eq('auth_user_id', user.id).maybeSingle()
      clientId = (cu?.client_id as string | null) ?? null
    }
    if (!clientId) return NextResponse.json({ prefs: null })
    const { data, error } = await admin
      .from('clients').select('design_prefs').eq('id', clientId).maybeSingle()
    if (error || !data?.design_prefs || typeof data.design_prefs !== 'object') return NextResponse.json({ prefs: null })
    const p = data.design_prefs as Record<string, unknown>
    return NextResponse.json({
      prefs: {
        ...(typeof p.makerVendorId === 'string' ? { makerVendorId: p.makerVendorId } : {}),
        ...(typeof p.makerName === 'string' ? { makerName: p.makerName } : {}),
        ...(p.tier === 1 || p.tier === 2 || p.tier === 3 ? { tier: p.tier } : {}),
        ...(p.brandMode === 'file' || p.brandMode === 'none' ? { brandMode: p.brandMode } : {}),
      },
    })
  } catch {
    return NextResponse.json({ prefs: null })
  }
}
