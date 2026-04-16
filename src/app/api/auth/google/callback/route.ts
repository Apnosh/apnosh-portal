import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { exchangeGoogleCode } from '@/lib/google'

/**
 * GET /api/auth/google/callback
 *
 * Google redirects here after the user authorizes. Exchanges the code
 * for tokens, stores a pending channel_connections row, redirects to
 * property selection.
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
    const tokens = await exchangeGoogleCode(code)
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

    // Store in channel_connections as 'pending' -- user will select property next
    // Use platform_account_id = 'pending' as a placeholder until they pick
    await supabase
      .from('channel_connections')
      .upsert({
        client_id: state.clientId,
        channel: 'google_analytics',
        connection_type: 'oauth',
        platform_account_id: 'pending',
        platform_account_name: 'Awaiting property selection',
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || null,
        token_expires_at: expiresAt,
        scopes: tokens.scope.split(' '),
        status: 'pending',
        connected_by: state.userId,
        connected_at: new Date().toISOString(),
      }, { onConflict: 'client_id,channel,platform_account_id' })

    // Redirect to property selection page
    const propertyPickerUrl = `/dashboard/connect-accounts/google-property?clientId=${state.clientId}${state.returnTo ? `&returnTo=${encodeURIComponent(state.returnTo)}` : ''}`
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}${propertyPickerUrl}`)
  } catch (err) {
    console.error('[google callback]', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/connect-accounts?error=${encodeURIComponent(message)}`
    )
  }
}
