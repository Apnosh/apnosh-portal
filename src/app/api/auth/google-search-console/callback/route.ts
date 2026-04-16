import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { exchangeGSCCode } from '@/lib/google'

/**
 * GET /api/auth/google-search-console/callback
 *
 * Google redirects here after the user authorizes Search Console access.
 * Stores a pending channel_connections row, redirects to site selection.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const stateParam = request.nextUrl.searchParams.get('state')
  const errorParam = request.nextUrl.searchParams.get('error')

  if (errorParam || !code || !stateParam) {
    const msg = request.nextUrl.searchParams.get('error_description') || 'Google OAuth was cancelled or failed'
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/connect-accounts?error=${encodeURIComponent(msg)}`
    )
  }

  let state: { clientId: string; userId: string; returnTo?: string; popup?: boolean }
  try {
    state = JSON.parse(Buffer.from(stateParam, 'base64url').toString())
  } catch {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/connect-accounts?error=${encodeURIComponent('Invalid OAuth state')}`
    )
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    const tokens = await exchangeGSCCode(code)
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

    // Store pending connection until site is selected
    await supabase
      .from('channel_connections')
      .upsert({
        client_id: state.clientId,
        channel: 'google_search_console',
        connection_type: 'oauth',
        platform_account_id: 'pending',
        platform_account_name: 'Awaiting site selection',
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || null,
        token_expires_at: expiresAt,
        scopes: tokens.scope.split(' '),
        status: 'pending',
        connected_by: state.userId,
        connected_at: new Date().toISOString(),
      }, { onConflict: 'client_id,channel,platform_account_id' })

    const sitePickerUrl = `/dashboard/connect-accounts/google-search-console-site?clientId=${state.clientId}${state.returnTo ? `&returnTo=${encodeURIComponent(state.returnTo)}` : ''}`
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}${sitePickerUrl}`)
  } catch (err) {
    console.error('[gsc callback]', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/connect-accounts?error=${encodeURIComponent(message)}`
    )
  }
}
