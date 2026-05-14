/**
 * Tiny rollup for the at-a-glance Website status strip: how many
 * open change requests does the current client have?
 */

import { NextResponse, type NextRequest } from 'next/server'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(_req: NextRequest) {
  const { user, clientId } = await resolveCurrentClient()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!clientId) return NextResponse.json({ error: 'No client context' }, { status: 403 })

  const admin = createAdminClient()
  const { count } = await admin
    .from('content_queue')
    .select('*', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .eq('service_area', 'website')
    .in('status', ['new', 'confirmed', 'drafting', 'in_review'])

  return NextResponse.json({ open_requests: count ?? 0 })
}
