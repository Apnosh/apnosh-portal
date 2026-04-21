import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { exchangeDriveCode } from '@/lib/google'

/**
 * GET /api/auth/google-drive/callback
 *
 * Exchange the OAuth code for tokens, fetch the granter's email, and
 * upsert the single `integrations` row for google_drive.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const stateParam = request.nextUrl.searchParams.get('state')
  const errorParam = request.nextUrl.searchParams.get('error')

  if (errorParam || !code || !stateParam) {
    const msg = request.nextUrl.searchParams.get('error_description') || 'Drive OAuth was cancelled or failed'
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/admin?drive_error=${encodeURIComponent(msg)}`
    )
  }

  let state: { userId: string; returnTo?: string }
  try {
    state = JSON.parse(Buffer.from(stateParam, 'base64url').toString())
  } catch {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/admin?drive_error=${encodeURIComponent('Invalid OAuth state')}`
    )
  }

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  try {
    const tokens = await exchangeDriveCode(code)
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

    // Fetch the granter's email so the UI can confirm "Connected as X"
    let email: string | null = null
    try {
      const r = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      })
      if (r.ok) {
        const u = await r.json()
        email = u.email ?? null
      }
    } catch {
      // non-fatal
    }

    // Upsert the single row
    const { error } = await db.from('integrations').upsert({
      provider: 'google_drive',
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? null,
      token_expires_at: expiresAt,
      metadata: { email, scopes: tokens.scope },
      granted_by: state.userId,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'provider' })

    if (error) throw new Error(error.message)

    const returnTo = state.returnTo || '/admin'
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}${returnTo}?drive_connected=1`)
  } catch (e) {
    const msg = (e as Error).message
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/admin?drive_error=${encodeURIComponent(msg)}`
    )
  }
}
