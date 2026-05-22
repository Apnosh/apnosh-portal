import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getGSCOAuthUrl } from '@/lib/google'
import { serviceAccountEnabled } from '@/lib/google-service-account'

/**
 * GET /api/auth/google-search-console?clientId=xxx[&returnTo=url][&popup=1]
 *
 * Initiates the Google OAuth flow for Search Console access.
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

  /* Service-account mode: no OAuth. Jump straight to the property picker,
     which lists the properties the service account has been granted. */
  if (serviceAccountEnabled()) {
    const picker = new URL('/dashboard/connect-accounts/google-search-console-site', request.nextUrl.origin)
    picker.searchParams.set('clientId', clientId)
    if (returnTo) picker.searchParams.set('returnTo', returnTo)
    return NextResponse.redirect(picker)
  }

  const state = Buffer.from(JSON.stringify({
    clientId,
    userId: user.id,
    returnTo,
    popup,
    ts: Date.now(),
  })).toString('base64url')

  const oauthUrl = getGSCOAuthUrl(state)
  return NextResponse.redirect(oauthUrl)
}
