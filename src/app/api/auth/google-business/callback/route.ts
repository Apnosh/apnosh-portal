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
    if (peekOrigin() === 'onboarding') {
      return NextResponse.redirect(`${APP_URL}/onboarding/full?gbp=cancelled`)
    }
    /* Straight to the live hub with a gbp status it renders. The old target was the
     * LEGACY /dashboard/connect-accounts stub, whose redirect drops the query string —
     * a cancelled Google login produced zero feedback. */
    return NextResponse.redirect(`${APP_URL}/dashboard/connected-accounts?gbp=cancelled`)
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
      `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/connected-accounts?gbp=error`
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
        `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/connected-accounts?gbp=error`
      )
    }

    /* The state token is NOT signed — it is caller-crafted base64. Before writing
     * tokens under state.clientId, prove the browser session actually is the user
     * who started the flow AND that they may act for that client. Without this,
     * anyone could complete their own Google login and park their token on any
     * client by editing the state. */
    try {
      const { createClient: createSessionClient } = await import('@/lib/supabase/server')
      const session = await createSessionClient()
      const { data: { user: caller } } = await session.auth.getUser()
      const { userMayConnectClient } = await import('@/lib/connect-access')
      if (!caller || caller.id !== state.userId || !(await userMayConnectClient(caller.id, state.clientId))) {
        return NextResponse.redirect(`${APP_URL}/dashboard/connected-accounts?gbp=error`)
      }
    } catch {
      return NextResponse.redirect(`${APP_URL}/dashboard/connected-accounts?gbp=error`)
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
      return NextResponse.redirect(`${APP_URL}/dashboard/connected-accounts?gbp=error`)
    }

    /* EVERY CONNECT MUST FINISH THE JOB, NOT PARK IT — onboarding AND the hub.
     *
     * This used to return leaving the row 'pending' — awaiting a location pick. A perfect
     * connect therefore produced no location, no sync and no data while the chip said
     * Connected. The owner's words (2026-08-14): "if it's connected, show it's connected,
     * and populate the data."
     *
     * So: fetch the account's listings and finalize (which activates the row, creates
     * gbp_locations and auto-backfills metrics). Most restaurants have exactly one listing,
     * so most connects complete without a single extra tap. Several listings -> the picker,
     * returning wherever the connect started. Listing fetch fails -> the row stays pending
     * and the destination says so honestly (?gbp=pending renders a finish-setup note, and
     * the pending row is now visible on the hub as "Setting up"). */
    const isOnboarding = state.origin === 'onboarding'
    const rt = state.returnTo
    const base = isOnboarding ? '/onboarding/full'
      : (rt && rt.startsWith('/') && !rt.startsWith('//') ? rt : '/dashboard/connected-accounts')
    const dest = (status: string) => `${APP_URL}${base}${base.includes('?') ? '&' : '?'}gbp=${status}`
    try {
      const { fetchGBPLocationsForClient, finalizeGBPConnections } = await import('@/lib/gbp-actions')
      const listed = await fetchGBPLocationsForClient(state.clientId)
      if (listed.success) {
        const flat = listed.data.flatMap((a) => a.locations.map((location) => ({ accountName: a.account.name, location })))
        if (flat.length === 1) {
          const fin = await finalizeGBPConnections(state.clientId, [flat[0]])
          if (fin.success) return NextResponse.redirect(dest('connected'))
        } else if (flat.length > 1) {
          const pickerReturn = `${base}${base.includes('?') ? '&' : '?'}gbp=connected`
          return NextResponse.redirect(
            `${APP_URL}/dashboard/connect-accounts/google-business-location?clientId=${state.clientId}&returnTo=${encodeURIComponent(pickerReturn)}`,
          )
        }
      }
    } catch (e) {
      console.error('[gbp callback] auto-finalize failed:', (e as Error).message)
      /* Token landed, listing unresolved. Saying ?gbp=connected here was a lie the audit
       * caught: the row is pending, no location, no data. Say what is true. */
      return NextResponse.redirect(dest('pending'))
    }
    /* Listing fetch returned but with zero locations, or finalize declined: also not done. */
    return NextResponse.redirect(dest('pending'))
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
