/**
 * GET /api/dashboard/catalog-content — the store's CMS payload:
 *  - overrides: the sparse campaign-content overrides overlaid onto the in-code
 *    CAMPAIGN_CONTENT records (Phase C1),
 *  - campaigns: LIVE admin-created DB campaigns (Phase C2), sparse ([] when none),
 *    which the builder registers into the runtime catalog.
 *
 * Content is catalog-wide, not client-specific, so the auth check is just "signed
 * in" — same session read the other dashboard routes start from. Missing tables /
 * any read error degrades to {} / [] (the store then renders pure code content).
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getContentOverrides } from '@/lib/campaigns/content-overrides-server'
import { getDbCampaigns } from '@/lib/campaigns/catalog-campaigns-server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 10

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })

  const [overrides, campaigns] = await Promise.all([getContentOverrides(), getDbCampaigns()])
  return NextResponse.json({ overrides, campaigns }, { headers: { 'Cache-Control': 'no-store' } })
}
