import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  exchangeCodeForToken,
  exchangeForLongLivedToken,
} from '@/lib/instagram'

/**
 * GET /api/auth/instagram/callback
 *
 * Meta redirects here after the user authorizes. Handles BOTH
 * Instagram and Facebook connections from a single OAuth flow.
 *
 * 1. Exchange code → long-lived token
 * 2. List all Pages the user manages
 * 3. For each Page, check for linked Instagram Business account
 * 4. Store Facebook Page connection (always)
 * 5. Store Instagram connection (if linked)
 * 6. Redirect back to admin
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const stateParam = request.nextUrl.searchParams.get('state')
  const errorParam = request.nextUrl.searchParams.get('error')

  if (errorParam || !code || !stateParam) {
    const msg = request.nextUrl.searchParams.get('error_description') || 'OAuth was cancelled or failed'
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/admin?error=${encodeURIComponent(msg)}`
    )
  }

  let state: { clientId: string; userId: string; returnTo?: string; popup?: boolean }
  try {
    state = JSON.parse(Buffer.from(stateParam, 'base64url').toString())
  } catch {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/admin?error=${encodeURIComponent('Invalid OAuth state')}`
    )
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    // 1. Token exchange
    const shortLived = await exchangeCodeForToken(code)
    const longLived = await exchangeForLongLivedToken(shortLived.access_token)
    const expiresIn = longLived.expires_in || 5184000 // default 60 days
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()

    // 2. List all Pages
    const pagesRes = await fetch(
      `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token&limit=100`,
      { headers: { Authorization: `Bearer ${longLived.access_token}` } }
    )
    const pagesData = await pagesRes.json()
    const rawPages = pagesData.data as { id: string; name: string; access_token: string }[] ?? []

    if (rawPages.length === 0) {
      const { data: clientRow } = await supabase
        .from('clients').select('slug').eq('id', state.clientId).single()
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/admin/clients/${clientRow?.slug || ''}?tab=connections&error=${encodeURIComponent('No Facebook Pages found. Make sure your account manages at least one Page.')}`
      )
    }

    // 3. Store Facebook Page connection (first Page, or update existing)
    const firstPage = rawPages[0]
    const { data: existingFb } = await supabase
      .from('platform_connections')
      .select('id')
      .eq('client_id', state.clientId)
      .eq('platform', 'facebook')
      .maybeSingle()

    const fbConnData = {
      client_id: state.clientId,
      platform: 'facebook',
      profile_url: `https://facebook.com/${firstPage.id}`,
      username: firstPage.name,
      access_token: firstPage.access_token,
      page_id: firstPage.id,
      page_name: firstPage.name,
      connected_at: new Date().toISOString(),
      expires_at: expiresAt,
    }

    if (existingFb) {
      await supabase.from('platform_connections').update(fbConnData).eq('id', existingFb.id)
    } else {
      await supabase.from('platform_connections').insert(fbConnData)
    }

    // 4. Check each Page for linked Instagram Business account
    let igConnected = false
    let igUsername = ''

    console.log('[meta callback] Checking', rawPages.length, 'pages for IG linkage...')
    for (const page of rawPages) {
      const igRes = await fetch(
        `https://graph.facebook.com/v21.0/${page.id}?fields=instagram_business_account{id,username,profile_picture_url,followers_count}`,
        { headers: { Authorization: `Bearer ${page.access_token}` } }
      )
      const igData = await igRes.json()
      console.log(`[meta callback] Page ${page.name} (${page.id}):`, JSON.stringify(igData))

      if (igData.instagram_business_account) {
        const ig = igData.instagram_business_account

        const { data: existingIg } = await supabase
          .from('platform_connections')
          .select('id')
          .eq('client_id', state.clientId)
          .eq('platform', 'instagram')
          .maybeSingle()

        const igConnData = {
          client_id: state.clientId,
          platform: 'instagram',
          profile_url: `https://instagram.com/${ig.username}`,
          username: ig.username || ig.id,
          access_token: page.access_token,
          refresh_token: longLived.access_token,
          ig_account_id: ig.id,
          page_id: page.id,
          page_name: page.name,
          connected_at: new Date().toISOString(),
          expires_at: expiresAt,
        }

        if (existingIg) {
          await supabase.from('platform_connections').update(igConnData).eq('id', existingIg.id)
        } else {
          await supabase.from('platform_connections').insert(igConnData)
        }

        igConnected = true
        igUsername = ig.username || ig.id
        break // Only connect the first IG account found
      }
    }

    // 5. Redirect back
    const connectedPlatforms = ['facebook']
    if (igConnected) connectedPlatforms.push('instagram')

    // Popup mode: render a page that sends message to opener and closes
    if (state.popup) {
      return new NextResponse(popupCloseHtml(connectedPlatforms), {
        headers: { 'Content-Type': 'text/html' },
      })
    }

    // returnTo mode: redirect to the specified URL
    if (state.returnTo) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}${state.returnTo}?connected=${connectedPlatforms.join(',')}`
      )
    }

    // Default: redirect to admin client page
    const { data: clientRow } = await supabase
      .from('clients').select('slug').eq('id', state.clientId).single()
    const slug = clientRow?.slug || ''

    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/admin/clients/${slug}?tab=connections&connected=${connectedPlatforms.join(',')}`
    )
  } catch (err) {
    console.error('[meta callback]', err)
    const message = err instanceof Error ? err.message : 'Unknown error'

    if (state.popup) {
      return new NextResponse(popupCloseHtml([], message), {
        headers: { 'Content-Type': 'text/html' },
      })
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
