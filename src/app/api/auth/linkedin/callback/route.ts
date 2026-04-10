import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  exchangeLinkedInCode,
  fetchLinkedInProfile,
  fetchLinkedInOrganizations,
} from '@/lib/linkedin'

/**
 * GET /api/auth/linkedin/callback
 * LinkedIn redirects here after OAuth. Stores the connection.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const stateParam = request.nextUrl.searchParams.get('state')
  const errorParam = request.nextUrl.searchParams.get('error')

  if (errorParam || !code || !stateParam) {
    const msg = request.nextUrl.searchParams.get('error_description') || 'LinkedIn OAuth was cancelled or failed'
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
    // Exchange code for token
    const tokens = await exchangeLinkedInCode(code)

    // Fetch profile
    const profile = await fetchLinkedInProfile(tokens.access_token)

    // Try to fetch organizations (Company Pages) the user admins
    const orgs = await fetchLinkedInOrganizations(tokens.access_token)

    // Store connection — use org name if available, otherwise personal profile
    const displayName = orgs.length > 0 ? orgs[0].name : profile.name
    const profileUrl = orgs.length > 0
      ? `https://linkedin.com/company/${orgs[0].vanityName}`
      : `https://linkedin.com/in/${profile.sub}`

    const { data: existing } = await supabase
      .from('platform_connections')
      .select('id')
      .eq('client_id', state.clientId)
      .eq('platform', 'linkedin')
      .maybeSingle()

    const connData = {
      client_id: state.clientId,
      platform: 'linkedin',
      profile_url: profileUrl,
      username: displayName,
      access_token: tokens.access_token,
      ig_account_id: orgs.length > 0 ? orgs[0].id : profile.sub, // reuse field for org/member ID
      page_name: orgs.length > 0 ? orgs[0].name : profile.name,
      connected_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    }

    if (existing) {
      await supabase.from('platform_connections').update(connData).eq('id', existing.id)
    } else {
      await supabase.from('platform_connections').insert(connData)
    }

    const { data: clientRow } = await supabase
      .from('clients').select('slug').eq('id', state.clientId).single()

    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/admin/clients/${clientRow?.slug || ''}?tab=connections&connected=linkedin&name=${encodeURIComponent(displayName)}`
    )
  } catch (err) {
    console.error('[linkedin callback]', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    const { data: clientRow } = await supabase
      .from('clients').select('slug').eq('id', state.clientId).maybeSingle()
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/admin/clients/${clientRow?.slug || ''}?tab=connections&error=${encodeURIComponent(message)}`
    )
  }
}
