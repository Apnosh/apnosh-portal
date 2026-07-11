/**
 * GET /api/dashboard/catalog-content — the sparse campaign-content overrides the
 * store overlays onto its in-code CAMPAIGN_CONTENT records (Phase C1 CMS).
 *
 * Returns ONLY the edited entries (item_id -> changed fields), so the payload is
 * {} when nothing has been edited. Content is catalog-wide, not client-specific,
 * so the auth check is just "signed in" — same session read the other dashboard
 * routes start from. Missing table / any read error degrades to {} (the store
 * then renders pure code content).
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getContentOverrides } from '@/lib/campaigns/content-overrides-server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 10

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })

  const overrides = await getContentOverrides()
  return NextResponse.json({ overrides }, { headers: { 'Cache-Control': 'no-store' } })
}
