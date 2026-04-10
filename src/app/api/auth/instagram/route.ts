import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOAuthUrl } from '@/lib/instagram'

/**
 * GET /api/auth/instagram?clientId=xxx
 *
 * Initiates the Meta OAuth flow. Admin only.
 * The `clientId` query param tells us which Apnosh client
 * we're connecting Instagram for.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  // Verify admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const clientId = request.nextUrl.searchParams.get('clientId')
  if (!clientId) {
    return NextResponse.json({ error: 'clientId is required' }, { status: 400 })
  }

  // Encode state: clientId + userId (so callback knows where to save the token)
  const state = Buffer.from(JSON.stringify({
    clientId,
    userId: user.id,
    ts: Date.now(),
  })).toString('base64url')

  const oauthUrl = getOAuthUrl(state)
  return NextResponse.redirect(oauthUrl)
}
