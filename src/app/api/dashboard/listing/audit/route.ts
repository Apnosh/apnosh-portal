/**
 * /api/dashboard/listing/audit — return the recent edit history for
 * this client's GBP listing. Backs the audit log viewer.
 */

import { NextResponse } from 'next/server'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { user, clientId } = await resolveCurrentClient()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!clientId) return NextResponse.json({ error: 'No client context' }, { status: 403 })

  const admin = createAdminClient()
  const { data: rows } = await admin
    .from('gbp_listing_audit')
    .select('id, actor_user_id, actor_email, action, fields, error, created_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(50)

  return NextResponse.json({ entries: rows ?? [] })
}
