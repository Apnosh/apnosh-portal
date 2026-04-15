import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { exchangeTikTokCode, fetchTikTokProfile, getCodeVerifier } from '@/lib/tiktok'

/**
 * GET /api/auth/tiktok/callback
 * TikTok redirects here after OAuth. Stores the connection.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const stateParam = request.nextUrl.searchParams.get('state')
  const errorParam = request.nextUrl.searchParams.get('error')

  if (errorParam || !code || !stateParam) {
    const msg = request.nextUrl.searchParams.get('error_description') || 'TikTok OAuth was cancelled or failed'
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/admin?error=${encodeURIComponent(msg)}`
    )
  }

  let state: { clientId: string; popup?: boolean }
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
    // Get the code_verifier from the PKCE flow
    const codeVerifier = getCodeVerifier(stateParam)
    if (!codeVerifier) {
      throw new Error('Missing code_verifier — OAuth session may have expired. Try again.')
    }

    // Exchange code for tokens
    const tokens = await exchangeTikTokCode(code, codeVerifier)

    // Fetch profile
    const profile = await fetchTikTokProfile(tokens.access_token)

    // Store connection
    const { data: existing } = await supabase
      .from('platform_connections')
      .select('id')
      .eq('client_id', state.clientId)
      .eq('platform', 'tiktok')
      .maybeSingle()

    const connData = {
      client_id: state.clientId,
      platform: 'tiktok',
      profile_url: `https://tiktok.com/@${profile.username}`,
      username: profile.username || profile.display_name,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      ig_account_id: tokens.open_id, // reuse field for TikTok open_id
      connected_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    }

    if (existing) {
      await supabase.from('platform_connections').update(connData).eq('id', existing.id)
    } else {
      await supabase.from('platform_connections').insert(connData)
    }

    if (state.popup) {
      return new NextResponse(popupCloseHtml(['TikTok']), { headers: { 'Content-Type': 'text/html' } })
    }

    const { data: clientRow } = await supabase
      .from('clients').select('slug').eq('id', state.clientId).single()

    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/admin/clients/${clientRow?.slug || ''}?tab=connections&connected=tiktok&username=${profile.username}`
    )
  } catch (err) {
    console.error('[tiktok callback]', err)
    const message = err instanceof Error ? err.message : 'Unknown error'

    if (state.popup) {
      return new NextResponse(popupCloseHtml([], message), { headers: { 'Content-Type': 'text/html' } })
    }

    const { data: clientRow } = await supabase
      .from('clients').select('slug').eq('id', state.clientId).maybeSingle()
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/admin/clients/${clientRow?.slug || ''}?tab=connections&error=${encodeURIComponent(message)}`
    )
  }
}

function popupCloseHtml(connected: string[], error?: string): string {
  return `<!DOCTYPE html><html><head><title>Connected</title></head><body>
<script>
  if (window.opener) {
    window.opener.postMessage({ type: 'oauth-callback', connected: ${JSON.stringify('PLACEHOLDER')}, error: ${JSON.stringify('ERR_PLACEHOLDER')} }, '*');
  }
  window.close();
</script>
<p>${error ? 'Connection failed. You can close this window.' : 'Connected! This window will close.'}</p>
</body></html>`
    .replace('"PLACEHOLDER"', JSON.stringify(connected))
    .replace('"ERR_PLACEHOLDER"', JSON.stringify(error || null))
}
