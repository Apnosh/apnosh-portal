import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOAuthUrl } from '@/lib/instagram'

/**
 * GET /api/auth/instagram-agency
 *
 * Kick off the agency-wide Meta OAuth flow. Unlike the per-client flow
 * at /api/auth/instagram, this stores the resulting token in the
 * single-row `integrations` table (provider = 'meta_agency'). The
 * grantor must be an Apnosh staff account that holds Page Admin / Editor
 * access on every client Facebook Page via Meta Business Manager.
 *
 * Once granted, the analytics pull can read every client's Page + IG
 * data through this one token. Restaurant owners don't need to OAuth
 * themselves -- their AM already has the access.
 *
 * Mirrors /api/auth/google-business-agency.
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
  // flow (Meta only allows registered URIs). The state tag tells the
  // callback to store in `integrations` instead of `platform_connections`.
  const returnTo = request.nextUrl.searchParams.get('returnTo') || '/admin/integrations/meta-agency'
  const state = Buffer.from(JSON.stringify({
    mode: 'agency',
    userId: user.id,
    returnTo,
    ts: Date.now(),
  })).toString('base64url')

  const oauthUrl = getOAuthUrl(state)
  return NextResponse.redirect(oauthUrl)
}
