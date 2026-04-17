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

    // Store in channel_connections as 'pending' -- user will select property next.
    // NOTE: the unique index on channel_connections is an expression index over
    // COALESCE(platform_account_id, 'default'), which Postgres will not match
    // against a plain-column ON CONFLICT clause. So upsert(..., { onConflict })
    // fails silently. Instead, delete any prior pending row, then insert.
    await supabase
      .from('channel_connections')
      .delete()
      .eq('client_id', state.clientId)
      .eq('channel', 'google_analytics')
      .eq('platform_account_id', 'pending')

    const { error: insertErr } = await supabase
      .from('channel_connections')
      .insert({
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
      })

    if (insertErr) {
      console.error('[google callback] insert failed:', insertErr)
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/connect-accounts?error=${encodeURIComponent(insertErr.message)}`
      )
    }

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
