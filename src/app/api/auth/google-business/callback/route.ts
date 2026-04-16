import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { exchangeGBPCode } from '@/lib/google'

/**
 * GET /api/auth/google-business/callback
 *
 * Google redirects here after the user authorizes GBP access.
 * Stores a pending channel_connections row, redirects to location picker.
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
    const tokens = await exchangeGBPCode(code)
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

    // Pending connection — user will select location next
    await supabase
      .from('channel_connections')
      .upsert({
        client_id: state.clientId,
        channel: 'google_business_profile',
        connection_type: 'oauth',
        platform_account_id: 'pending',
        platform_account_name: 'Awaiting location selection',
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || null,
        token_expires_at: expiresAt,
        scopes: tokens.scope.split(' '),
        status: 'pending',
        connected_by: state.userId,
        connected_at: new Date().toISOString(),
      }, { onConflict: 'client_id,channel,platform_account_id' })

    const locationPickerUrl = `/dashboard/connect-accounts/google-business-location?clientId=${state.clientId}${state.returnTo ? `&returnTo=${encodeURIComponent(state.returnTo)}` : ''}`
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}${locationPickerUrl}`)
  } catch (err) {
    console.error('[gbp callback]', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/connect-accounts?error=${encodeURIComponent(message)}`
    )
  }
}
