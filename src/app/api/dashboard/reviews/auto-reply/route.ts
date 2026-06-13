/**
 * /api/dashboard/reviews/auto-reply — read/set the owner's auto-reply
 * preference (auto-reply to new 5-star Google reviews).
 */

import { NextResponse, type NextRequest } from 'next/server'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const { user, clientId } = await resolveCurrentClient()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!clientId) return NextResponse.json({ error: 'No client context' }, { status: 403 })

  const admin = createAdminClient()
  const { data, error } = await admin.from('clients').select('auto_reply_five_star').eq('id', clientId).maybeSingle()
  // Column may not exist until the migration runs — degrade to false.
  if (error) return NextResponse.json({ enabled: false, available: false })
  return NextResponse.json({ enabled: !!data?.auto_reply_five_star, available: true })
}

export async function PATCH(req: NextRequest) {
  const { user, clientId } = await resolveCurrentClient()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!clientId) return NextResponse.json({ error: 'No client context' }, { status: 403 })

  const body = await req.json().catch(() => null) as { enabled?: boolean } | null
  if (typeof body?.enabled !== 'boolean') return NextResponse.json({ error: 'Missing enabled' }, { status: 400 })

  const admin = createAdminClient()
  const { error } = await admin.from('clients').update({ auto_reply_five_star: body.enabled }).eq('id', clientId)
  if (error) return NextResponse.json({ error: error.message }, { status: 502 })
  return NextResponse.json({ ok: true, enabled: body.enabled })
}
