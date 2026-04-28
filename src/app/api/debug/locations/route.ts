/**
 * TEMPORARY debug endpoint -- delete after Phase 1 multi-location is verified.
 * Returns whether admin Supabase can read gbp_locations rows for a clientId.
 */

import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const clientId = url.searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'missing clientId' }, { status: 400 })

  const hasUrl = !!process.env.NEXT_PUBLIC_SUPABASE_URL
  const hasKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY

  let result: unknown = null
  let errorMsg: string | null = null
  try {
    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )
    const { data, error } = await admin
      .from('gbp_locations')
      .select('id, location_name, status, client_id')
      .eq('client_id', clientId)
    result = data
    errorMsg = error?.message ?? null
  } catch (e) {
    errorMsg = e instanceof Error ? e.message : String(e)
  }

  return NextResponse.json({
    env: { hasUrl, hasKey },
    clientId,
    rows: Array.isArray(result) ? result.length : null,
    sample: Array.isArray(result) ? result.slice(0, 5) : result,
    error: errorMsg,
  })
}
