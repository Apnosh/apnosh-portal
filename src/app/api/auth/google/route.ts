import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getGoogleOAuthUrl } from '@/lib/google'

/**
 * GET /api/auth/google?clientId=xxx[&returnTo=url][&popup=1]
 *
 * Initiates the Google OAuth flow for GA4 Analytics access.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const clientId = request.nextUrl.searchParams.get('clientId')
  if (!clientId) {
    return NextResponse.json({ error: 'clientId is required' }, { status: 400 })
  }

  const returnTo = request.nextUrl.searchParams.get('returnTo') || ''
  const popup = request.nextUrl.searchParams.get('popup') === '1'

  const state = Buffer.from(JSON.stringify({
    clientId,
    userId: user.id,
    returnTo,
    popup,
    ts: Date.now(),
  })).toString('base64url')

  const oauthUrl = getGoogleOAuthUrl(state)
  return NextResponse.redirect(oauthUrl)
}
