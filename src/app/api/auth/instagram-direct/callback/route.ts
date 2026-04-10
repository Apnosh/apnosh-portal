import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { exchangeInstagramDirectCode, exchangeForLongLivedIgToken } from '@/lib/instagram'

/**
 * GET /api/auth/instagram-direct/callback
 * Instagram redirects here after direct Instagram OAuth.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const stateParam = request.nextUrl.searchParams.get('state')
  const errorParam = request.nextUrl.searchParams.get('error')

  if (errorParam || !code || !stateParam) {
    const msg = request.nextUrl.searchParams.get('error_description') || request.nextUrl.searchParams.get('error_reason') || 'Instagram OAuth was cancelled'
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/admin?error=${encodeURIComponent(msg)}`
    )
  }

  let state: { clientId: string }
  try {
    state = JSON.parse(Buffer.from(stateParam, 'base64url').toString())
  } catch {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/admin?error=${encodeURIComponent('Invalid state')}`
    )
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    // 1. Exchange code for short-lived token
    const shortLived = await exchangeInstagramDirectCode(code)

    // 2. Exchange for long-lived token (60 days)
    const longLived = await exchangeForLongLivedIgToken(shortLived.access_token)

    // 3. Fetch profile info
    const profileRes = await fetch(
      `https://graph.instagram.com/v21.0/me?fields=id,username,name,followers_count,profile_picture_url`,
      { headers: { Authorization: `Bearer ${longLived.access_token}` } }
    )
    const profile = await profileRes.json()

    if (profile.error) {
      throw new Error(profile.error.message || 'Failed to fetch Instagram profile')
    }

    // 4. Store connection
    const { data: existing } = await supabase
      .from('platform_connections')
      .select('id')
      .eq('client_id', state.clientId)
      .eq('platform', 'instagram')
      .maybeSingle()

    const connData = {
      client_id: state.clientId,
      platform: 'instagram',
      profile_url: `https://instagram.com/${profile.username}`,
      username: profile.username,
      access_token: longLived.access_token,
      ig_account_id: profile.id,
      connected_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + (longLived.expires_in || 5184000) * 1000).toISOString(),
    }

    if (existing) {
      await supabase.from('platform_connections').update(connData).eq('id', existing.id)
    } else {
      await supabase.from('platform_connections').insert(connData)
    }

    // 5. Redirect back
    const { data: clientRow } = await supabase
      .from('clients').select('slug').eq('id', state.clientId).single()

    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/admin/clients/${clientRow?.slug || ''}?tab=connections&connected=instagram&username=${profile.username}`
    )
  } catch (err) {
    console.error('[instagram-direct callback]', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    const { data: clientRow } = await supabase
      .from('clients').select('slug').eq('id', state.clientId).maybeSingle()
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/admin/clients/${clientRow?.slug || ''}?tab=connections&error=${encodeURIComponent(message)}`
    )
  }
}
