/**
 * Apply a chosen variant from a multi-variant refine pass.
 *
 * The variant picker UI sends back the full merged site; we just persist
 * it. Cheaper than re-running Claude.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { RestaurantSite } from '@/lib/site-schemas/restaurant'

interface Body {
  clientId: string
  site: RestaurantSite
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const body = await req.json().catch(() => null) as Body | null
  if (!body?.clientId || !body.site) {
    return NextResponse.json({ error: 'clientId + site required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('site_configs')
    .update({ draft_data: body.site })
    .eq('client_id', body.clientId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
