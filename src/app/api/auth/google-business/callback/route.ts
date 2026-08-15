import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { exchangeGBPCode } from '@/lib/google'

/**
 * GET /api/auth/google-business/callback
 *
 * Two flows share this single redirect URI (we only registered one
 * with Google's OAuth client):
 *
 *   1. Per-client flow (state.clientId set): user is connecting their
 *      own restaurant's GBP. Token lands in channel_connections with
 *      status='pending', and they continue to the location picker.
 *
 *   2. Agency flow (state.mode === 'agency'): an admin granted
 *      Apnosh-wide GBP access via apnosh@gmail.com which holds
 *      Manager on all 21 locations. Token lands in the single-row
 *      `integrations` table so the daily cron can use it.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const stateParam = request.nextUrl.searchParams.get('state')
  const errorParam = request.nextUrl.searchParams.get('error')
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL

  // Best-effort peek at the origin so even a cancel/early failure can route an
  // onboarding user back to the wizard rather than dumping them on the dashboard.
  const peekOrigin = (): string => {
    if (!stateParam) return ''
    try {
      return (JSON.parse(Buffer.from(stateParam, 'base64url').toString())?.origin as string) || ''
    } catch {
      return ''
    }
  }

  if (errorParam || !code || !stateParam) {
    const msg = request.nextUrl.searchParams.get('error_description') || 'Google OAuth was cancelled or failed'
    if (peekOrigin() === 'onboarding') {
      return NextResponse.redirect(`${APP_URL}/onboarding/full?gbp=cancelled`)
    }
    return NextResponse.redirect(
      `${APP_URL}/dashboard/connect-accounts?error=${encodeURIComponent(msg)}`
    )
  }

  type State = {
    clientId?: string
    userId: string
    returnTo?: string
    popup?: boolean
    origin?: string
    mode?: 'agency'
  }
  let state: State
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

    // ============================================================
    // Agency flow: store in `integrations` table, redirect to admin.
    // ============================================================
    if (state.mode === 'agency') {
      // Try to capture which Google account granted (helpful for the
      // admin UI showing "Connected as foo@gmail.com").
      let granterEmail: string | null = null
      try {
        const profileRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        })
        if (profileRes.ok) {
          const profile = await profileRes.json() as { email?: string }
          granterEmail = profile.email ?? null
        }
      } catch { /* non-fatal */ }

      // Upsert manually since (provider) is the unique key on integrations
      const { data: existing } = await supabase
        .from('integrations')
        .select('id')
        .eq('provider', 'google_business')
        .maybeSingle()

      const row = {
        provider: 'google_business',
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || null,
        token_expires_at: expiresAt,
        metadata: {
          email: granterEmail,
          scopes: tokens.scope?.split(' ') ?? [],
        },
        granted_by: state.userId,
        updated_at: new Date().toISOString(),
      }

      if (existing) {
        await supabase.from('integrations').update(row).eq('id', existing.id)
      } else {
        await supabase.from('integrations').insert(row)
      }

      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/admin/settings?gbp_connected=1`
      )
    }

    // ============================================================
    // Per-client flow (existing): pending row, location picker.
    // ============================================================
    if (!state.clientId) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/connect-accounts?error=${encodeURIComponent('Missing clientId in state')}`
      )
    }

    await supabase
      .from('channel_connections')
      .delete()
      .eq('client_id', state.clientId)
      .eq('channel', 'google_business_profile')
      .eq('platform_account_id', 'pending')

    const { error: insertErr } = await supabase
      .from('channel_connections')
      .insert({
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
      })

    if (insertErr) {
      console.error('[gbp callback] insert failed:', insertErr)
      if (state.origin === 'onboarding') {
        return NextResponse.redirect(`${APP_URL}/onboarding/full?gbp=error`)
      }
      return NextResponse.redirect(
        `${APP_URL}/dashboard/connect-accounts?error=${encodeURIComponent(insertErr.message)}`
      )
    }

    /* ONBOARDING MUST FINISH THE JOB, NOT PARK IT.
     *
     * This used to return to the wizard leaving the row 'pending' — awaiting a location pick
     * the wizard never offers. A perfect connect therefore produced no location, no sync and
     * no data, forever, while the chip said Connected. The owner's words (2026-08-14): "if
     * it's connected, show it's connected, and populate the data."
     *
     * The machinery to finish has existed all along: fetch the account's listings, finalize
     * the pick (which activates the row, creates gbp_locations and auto-backfills metrics).
     * Most restaurants have exactly one listing, so most connects now complete without a
     * single extra tap. Several listings -> the existing picker, returning to the wizard.
     * Listing fails -> the old pending behaviour, finishable from the dashboard: no worse
     * than before, and the wizard still says so honestly. */
    if (state.origin === 'onboarding') {
      try {
        const { fetchGBPLocationsForClient, finalizeGBPConnections } = await import('@/lib/gbp-actions')
        const listed = await fetchGBPLocationsForClient(state.clientId)
        if (listed.success) {
          const flat = listed.data.flatMap((a) => a.locations.map((location) => ({ accountName: a.account.name, location })))
          if (flat.length === 1) {
            const fin = await finalizeGBPConnections(state.clientId, [flat[0]])
            if (fin.success) return NextResponse.redirect(`${APP_URL}/onboarding/full?gbp=connected`)
          } else if (flat.length > 1) {
            return NextResponse.redirect(
              `${APP_URL}/dashboard/connect-accounts/google-business-location?clientId=${state.clientId}&returnTo=${encodeURIComponent('/onboarding/full?gbp=connected')}`,
            )
          }
        }
      } catch (e) {
        console.error('[gbp callback] onboarding auto-finalize failed:', (e as Error).message)
        /* The token landed but we could not resolve a listing. Saying ?gbp=connected here was a
         * lie the audit caught: the row is pending, no location, no data. Say what is true so
         * the wizard can tell the owner one step remains, and the stuck-pending probe has an
         * honest trail. */
        return NextResponse.redirect(`${APP_URL}/onboarding/full?gbp=pending`)
      }
      /* Listing fetch returned but with zero locations, or finalize declined: also not done. */
      return NextResponse.redirect(`${APP_URL}/onboarding/full?gbp=pending`)
    }

    const locationPickerUrl = `/dashboard/connect-accounts/google-business-location?clientId=${state.clientId}${state.returnTo ? `&returnTo=${encodeURIComponent(state.returnTo)}` : ''}`
    return NextResponse.redirect(`${APP_URL}${locationPickerUrl}`)
  } catch (err) {
    console.error('[gbp callback]', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    if (peekOrigin() === 'onboarding') {
      return NextResponse.redirect(`${APP_URL}/onboarding/full?gbp=error`)
    }
    return NextResponse.redirect(
      `${APP_URL}/dashboard/connect-accounts?error=${encodeURIComponent(message)}`
    )
  }
}
