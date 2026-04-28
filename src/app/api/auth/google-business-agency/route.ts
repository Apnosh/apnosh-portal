import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getGBPOAuthUrl } from '@/lib/google'

/**
 * GET /api/auth/google-business-agency
 *
 * Start the agency-wide Google Business OAuth flow. Unlike the
 * per-client flow at /api/auth/google-business, this one stores the
 * resulting token in the single-row `integrations` table so the
 * Vercel cron can pull GBP performance data for every location
 * Apnosh manages under the granting Google account.
 *
 * The grantor must be an account that holds Manager access on all
 * the GBP locations Apnosh services (today: apnosh@gmail.com with
 * 21 verified locations). Only an admin user logged in to the portal
 * can start this flow.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  if (profile?.role !== 'admin' && profile?.role !== 'super_admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  // The agency callback shares the same redirect URI as the per-client
  // flow (we registered only one), so we tag the state so the callback
  // knows to store in `integrations` instead of `channel_connections`.
  const state = Buffer.from(JSON.stringify({
    mode: 'agency',
    userId: user.id,
    ts: Date.now(),
  })).toString('base64url')

  const oauthUrl = getGBPOAuthUrl(state)
  return NextResponse.redirect(oauthUrl)
}
