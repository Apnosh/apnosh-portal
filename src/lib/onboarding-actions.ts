'use server'

import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Ensures a `clients` record exists for the given business, linked via
 * businesses.client_id. Returns the client_id. Used during onboarding
 * so OAuth flows have a client_id to store tokens against.
 * Uses admin client to bypass RLS.
 */
export async function ensureClientForBusiness(businessId: string): Promise<string | null> {
  const supabase = createAdminClient()

  // Check if businesses already has a linked client
  const { data: biz, error: bizErr } = await supabase
    .from('businesses')
    .select('id, name, client_id, industry, city, state, website_url, phone')
    .eq('id', businessId)
    .single()

  if (bizErr || !biz) {
    console.error('[ensureClient] Business not found:', businessId, bizErr?.message)
    return null
  }

  // Already linked to a client
  if (biz.client_id) {
    console.log('[ensureClient] Already linked to client:', biz.client_id)
    return biz.client_id
  }

  // Check if a client with this name already exists (case-insensitive) — link to it
  const { data: existingClient } = await supabase
    .from('clients')
    .select('id')
    .ilike('name', biz.name || 'My Business')
    .maybeSingle()

  if (existingClient) {
    console.log('[ensureClient] Found existing client by name, linking:', existingClient.id)
    const { error: updateErr } = await supabase
      .from('businesses')
      .update({ client_id: existingClient.id })
      .eq('id', businessId)

    if (updateErr) {
      console.error('[ensureClient] Failed to link business to existing client:', updateErr.message)
      return null
    }
    return existingClient.id
  }

  // Create a new clients row from business data
  const slug = (biz.name || 'business')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50)
    + '-' + Date.now().toString(36)

  const location = [biz.city, biz.state].filter(Boolean).join(', ')

  const { data: newClient, error: insertErr } = await supabase
    .from('clients')
    .insert({
      name: biz.name || 'My Business',
      slug,
      industry: biz.industry || '',
      location: location || '',
      website: biz.website_url || '',
      phone: biz.phone || '',
      services_active: ['social'],
      tier: 'standard',
      billing_status: 'pending',
      onboarding_date: new Date().toISOString().split('T')[0],
    })
    .select('id')
    .single()

  if (insertErr || !newClient) {
    console.error('[ensureClient] Failed to create client:', insertErr?.message)
    return null
  }

  console.log('[ensureClient] Created new client:', newClient.id)

  // Link the business to the client
  const { error: linkErr } = await supabase
    .from('businesses')
    .update({ client_id: newClient.id })
    .eq('id', businessId)

  if (linkErr) {
    console.error('[ensureClient] Failed to link business:', linkErr.message)
  }

  return newClient.id
}

/**
 * Check which platforms are connected for a given client.
 */
export async function getConnectedPlatforms(clientId: string): Promise<Record<string, boolean>> {
  const supabase = createAdminClient()

  const { data } = await supabase
    .from('platform_connections')
    .select('platform')
    .eq('client_id', clientId)
    .not('access_token', 'is', null)

  const connected: Record<string, boolean> = {}
  if (data) {
    for (const row of data) {
      const name = row.platform === 'instagram' ? 'Instagram'
        : row.platform === 'facebook' ? 'Facebook'
        : row.platform === 'tiktok' ? 'TikTok'
        : row.platform === 'linkedin' ? 'LinkedIn'
        : row.platform === 'google_business' ? 'Google Business'
        : row.platform === 'yelp' ? 'Yelp'
        : row.platform
      connected[name] = true
    }
  }
  return connected
}

/**
 * Get connected platforms for the current user's client.
 * Uses admin client to bypass RLS. Returns platform + username pairs.
 */
export async function getMyConnectedPlatforms(): Promise<Array<{ platform: string; username: string | null; page_name: string | null }>> {
  const { createClient: createServerClient } = await import('@/lib/supabase/server')
  const userSupabase = await createServerClient()
  const { data: { user } } = await userSupabase.auth.getUser()
  if (!user) return []

  // Resolve client_id via businesses
  const supabase = createAdminClient()
  const { data: biz } = await supabase
    .from('businesses')
    .select('client_id')
    .eq('owner_id', user.id)
    .maybeSingle()

  let clientId = biz?.client_id

  // Fallback to client_users
  if (!clientId) {
    const { data: cu } = await supabase
      .from('client_users')
      .select('client_id')
      .eq('auth_user_id', user.id)
      .maybeSingle()
    clientId = cu?.client_id
  }

  if (!clientId) return []

  const { data } = await supabase
    .from('platform_connections')
    .select('platform, username, page_name')
    .eq('client_id', clientId)
    .not('access_token', 'is', null)

  return (data ?? []) as Array<{ platform: string; username: string | null; page_name: string | null }>
}
