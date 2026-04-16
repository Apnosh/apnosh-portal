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
 * After onboarding completes, create/populate the client_profiles record
 * and ensure a client_users row links the auth user to the client.
 * Uses admin client to bypass RLS. Delegates profile writes to crm-sync.
 */
export async function completeOnboardingCRM(
  businessId: string,
  userId: string,
  data: Record<string, unknown>
): Promise<{ clientId: string | null; error: string | null }> {
  const { upsertClientProfile } = await import('@/lib/crm-sync')
  const supabase = createAdminClient()

  // 1. Ensure clients record exists and is linked
  const clientId = await ensureClientForBusiness(businessId)
  if (!clientId) {
    return { clientId: null, error: 'Failed to create/link client record' }
  }

  // 2. Upsert client_profiles via shared CRM sync
  const { error: profileErr } = await upsertClientProfile(clientId, {
    user_role: data.role as string || null,
    business_type: data.biz_type as string || null,
    business_type_other: data.biz_other as string || null,
    business_description: data.biz_desc as string || null,
    unique_differentiator: data.unique as string || null,
    competitors: data.competitors as string || null,
    cuisine: data.cuisine as string || null,
    cuisine_other: data.cuisine_other as string || null,
    service_styles: data.service_styles as string[] || [],
    full_address: data.full_address as string || null,
    city: data.city as string || null,
    state: data.state as string || null,
    zip: data.zip as string || null,
    location_count: data.location_count as string || null,
    hours: data.hours as Record<string, unknown> || null,
    website_url: data.website as string || null,
    business_phone: data.phone as string || null,
    customer_types: data.customer_types as string[] || [],
    why_choose: data.why_choose as string[] || [],
    primary_goal: data.primary_goal as string || null,
    goal_detail: data.goal_detail as string || null,
    success_signs: data.success_signs as string[] || [],
    timeline: data.timeline as string || null,
    main_offerings: data.main_offerings as string || null,
    upcoming_events: data.upcoming as string || null,
    tone_tags: data.tones as string[] || [],
    custom_tone: data.custom_tone as string || null,
    content_type_tags: data.content_likes as string[] || [],
    reference_accounts: data.ref_accounts as string || null,
    avoid_content_tags: data.avoid_list as string[] || [],
    approval_type: data.approval_type as string || null,
    can_film: data.can_film as string[] || [],
    can_tag: data.can_tag as string || null,
    platforms_connected: data.connected as Record<string, boolean> || {},
    logo_url: data.logo_url as string || null,
    brand_color_primary: data.color1 as string || '#4abd98',
    brand_color_secondary: data.color2 as string || '#2e9a78',
    brand_drive: data.brand_drive as string || null,
    onboarding_complete: true,
    onboarding_step: 99,
    agreed_terms: true,
    agreed_terms_at: new Date().toISOString(),
    onboarding_completed_at: new Date().toISOString(),
  })

  if (profileErr) {
    console.error('[completeOnboardingCRM] Profile upsert failed:', profileErr)
  }

  // 3. Ensure client_users row links auth user to client
  const { data: existingCU } = await supabase
    .from('client_users')
    .select('id')
    .eq('auth_user_id', userId)
    .maybeSingle()

  if (!existingCU) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('email, full_name')
      .eq('id', userId)
      .single()

    await supabase
      .from('client_users')
      .insert({
        client_id: clientId,
        auth_user_id: userId,
        email: profile?.email || '',
        name: profile?.full_name || '',
        role: 'owner',
        status: 'active',
      })
  }

  return { clientId, error: null }
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

  const [pc, cc] = await Promise.all([
    supabase
      .from('platform_connections')
      .select('platform, username, page_name')
      .eq('client_id', clientId)
      .not('access_token', 'is', null),
    // channel_connections (new unified layer) — GA4, etc.
    supabase
      .from('channel_connections')
      .select('channel, platform_account_name')
      .eq('client_id', clientId)
      .eq('status', 'active')
      .not('access_token', 'is', null),
  ])

  const results: Array<{ platform: string; username: string | null; page_name: string | null }> = []
  for (const r of pc.data ?? []) {
    results.push({ platform: r.platform, username: r.username, page_name: r.page_name })
  }
  for (const r of cc.data ?? []) {
    results.push({ platform: r.channel, username: r.platform_account_name, page_name: null })
  }
  return results
}
