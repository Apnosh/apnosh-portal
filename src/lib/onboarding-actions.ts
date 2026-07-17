'use server'

import { createAdminClient } from '@/lib/supabase/admin'

/** Parse a free-form price like "$12.99" or "12" into integer cents, or null. */
function parsePriceCents(raw: unknown): number | null {
  if (typeof raw !== 'string') return null
  const digits = raw.replace(/[^0-9.]/g, '')
  if (!digits) return null
  const n = parseFloat(digits)
  return isNaN(n) ? null : Math.round(n * 100)
}

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
    .select('id, name, client_id, industry, city, state, website_url, phone, owner_id')
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

  // Reuse an existing client ONLY when it already belongs to this business's OWNER
  // (a client_users row links the owner's auth user to it). Never link by name alone:
  // two different owners with the same restaurant name must never share campaigns,
  // connections, or billing (cross-tenant data mixing).
  if (biz.owner_id) {
    const { data: myLinks } = await supabase
      .from('client_users')
      .select('client_id')
      .eq('auth_user_id', biz.owner_id)
    const myClientIds = (myLinks ?? []).map((l) => l.client_id).filter((x): x is string => !!x)
    if (myClientIds.length) {
      const { data: existingClient } = await supabase
        .from('clients')
        .select('id')
        .in('id', myClientIds)
        .ilike('name', biz.name || 'My Business')
        .maybeSingle()

      if (existingClient) {
        console.log('[ensureClient] Owner already has this client, linking:', existingClient.id)
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
    }
  }

  // Create a new clients row from business data
  const slug = (biz.name || 'business')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50)
    + '-' + Date.now().toString(36)

  const location = [biz.city, biz.state].filter(Boolean).join(', ')

  /* billing_status defaults to 'active'. We don't set 'pending' here
     because the table's CHECK constraint only allows
     active/paused/cancelled/past_due. In the new free-portal model the
     client's billing_status is 'active' from day one -- they just have
     no paid services yet. When they subscribe to one, client_services
     rows appear; cancelling everything leaves billing_status='active'
     but with no active services. */
  const { data: newClient, error: insertErr } = await supabase
    .from('clients')
    .insert({
      name: biz.name || 'My Business',
      slug,
      industry: biz.industry || '',
      location: location || '',
      website: biz.website_url || '',
      phone: biz.phone || '',
      /* New clients start with NO active services. The portal itself is
         free; services_active fills up as the client subscribes to
         specific offerings from /dashboard/services. Previously this
         was hardcoded to ['social'] which made the Social channel show
         in the sidebar before the client had subscribed to anything. */
      services_active: [],
      /* CHECK constraint requires title-case Basic/Standard/Pro/Internal. */
      tier: 'Basic',
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
    price_range: data.price_range as string || null,
    signature_items: (data.signature_items as string[] || []).filter((s) => s.trim().length > 0),
    dietary_options: data.dietary_options as string[] || [],
    slow_periods: data.slow_periods as Record<string, unknown> || {},
    full_address: data.full_address as string || null,
    city: data.city as string || null,
    state: data.state as string || null,
    zip: data.zip as string || null,
    location_count: data.location_count as string || null,
    hours: data.hours as Record<string, unknown> || null,
    website_url: data.website as string || null,
    business_phone: data.phone as string || null,
    customer_types: data.customer_types as string[] || [],
    customer_age_range: data.customer_age_range as string || null,
    why_choose: data.why_choose as string[] || [],
    primary_goal: data.primary_goal as string || null,
    goal_detail: data.goal_detail as string || null,
    success_signs: data.success_signs as string[] || [],
    timeline: data.timeline as string || null,
    main_offerings: data.main_offerings as string || null,
    upcoming_events: data.upcoming as string || null,
    tone_tags: data.tones as string[] || [],
    avoid_tone_tags: data.avoid_tones as string[] || [],
    emoji_usage: data.emoji_usage as string || null,
    custom_tone: data.custom_tone as string || null,
    content_type_tags: data.content_likes as string[] || [],
    reference_accounts: data.ref_accounts as string || null,
    avoid_content_tags: data.avoid_list as string[] || [],
    approval_type: data.approval_type as string || null,
    can_film: data.can_film as string[] || [],
    can_tag: data.can_tag as string || null,
    platforms_connected: data.connected as Record<string, boolean> || {},
    logo_url: data.logo_url as string || null,
    brand_color_primary: data.color1 as string || null,
    brand_color_secondary: data.color2 as string || null,
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

  // 2b. Route onboarding answers into the AI-readable layer
  //     (client_knowledge_facts + client_brands). Best-effort: a hiccup
  //     here must not fail onboarding completion.
  try {
    const { syncOnboardingToKnowledge } = await import('@/lib/ai/onboarding-facts')
    const sync = await syncOnboardingToKnowledge(clientId, userId, data)
    if (sync.error) {
      console.error('[completeOnboardingCRM] Knowledge sync error:', sync.error)
    } else {
      console.log(
        `[completeOnboardingCRM] Knowledge sync: ${sync.factsWritten} facts, brand=${sync.brandWritten}`,
      )
    }
  } catch (e) {
    console.error('[completeOnboardingCRM] Knowledge sync threw:', e)
  }

  // 2c. Seed the structured menu + specials from onboarding answers.
  //     Idempotent by absence: we only seed when the client has none yet,
  //     so a skip-then-complete pass won't duplicate, and we never clobber
  //     menu/specials a strategist may have added in between.
  try {
    const menuDraft = Array.isArray(data.menu_items)
      ? (data.menu_items as Array<{ name?: unknown; price?: unknown; category?: unknown }>)
      : []
    const cleanMenu = menuDraft.filter(
      (m) => m && typeof m.name === 'string' && (m.name as string).trim() !== '',
    )
    if (cleanMenu.length) {
      const { count } = await supabase
        .from('menu_items')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', clientId)
      if (!count) {
        const rows = cleanMenu.map((m, i) => ({
          client_id: clientId,
          category: (typeof m.category === 'string' && m.category.trim()) || 'Menu',
          name: (m.name as string).trim(),
          price_cents: parsePriceCents(m.price),
          display_order: i,
          last_edited_by: userId,
        }))
        const { error: menuErr } = await supabase.from('menu_items').insert(rows)
        if (menuErr) console.error('[completeOnboardingCRM] menu seed error:', menuErr.message)
        else console.log(`[completeOnboardingCRM] Seeded ${rows.length} menu_items`)
      }
    }
  } catch (e) {
    console.error('[completeOnboardingCRM] menu seed threw:', e)
  }

  try {
    const specialsDraft = Array.isArray(data.specials)
      ? (data.specials as Array<{ title?: unknown; time_window?: unknown; details?: unknown }>)
      : []
    const cleanSpecials = specialsDraft.filter(
      (s) => s && typeof s.title === 'string' && (s.title as string).trim() !== '',
    )
    if (cleanSpecials.length) {
      const { count } = await supabase
        .from('client_specials')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', clientId)
      if (!count) {
        const rows = cleanSpecials.map((s, i) => ({
          client_id: clientId,
          title: (s.title as string).trim(),
          time_window: typeof s.time_window === 'string' && s.time_window.trim() ? s.time_window.trim() : null,
          tagline: typeof s.details === 'string' && s.details.trim() ? s.details.trim() : null,
          display_order: i,
          last_edited_by: userId,
        }))
        const { error: specErr } = await supabase.from('client_specials').insert(rows)
        if (specErr) console.error('[completeOnboardingCRM] specials seed error:', specErr.message)
        else console.log(`[completeOnboardingCRM] Seeded ${rows.length} client_specials`)
      }
    }
  } catch (e) {
    console.error('[completeOnboardingCRM] specials seed threw:', e)
  }

  // 2d. Seed client_locations for multi-location businesses. The location
  //     step captures the primary address on `businesses`; any ADDITIONAL
  //     locations land in data.locations. When the owner listed extras, we
  //     promote the primary (is_primary=true) plus each extra so downstream
  //     local-SEO / reviews tooling can work per-location. Idempotent by
  //     absence, and single-location accounts keep today's behavior (no rows).
  try {
    const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
    const locDraft = Array.isArray(data.locations)
      ? (data.locations as Array<{
          name?: unknown; full_address?: unknown
          city?: unknown; state?: unknown; zip?: unknown; place_id?: unknown
          hours?: unknown
        }>)
      : []
    const cleanLocs = locDraft.filter(
      (l) => l && typeof l.full_address === 'string' && (l.full_address as string).trim() !== '',
    )
    if (cleanLocs.length) {
      const { count } = await supabase
        .from('client_locations')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', clientId)
      if (!count) {
        const rows: Array<Record<string, unknown>> = []
        const primaryAddr = str(data.full_address)
        if (primaryAddr) {
          rows.push({
            client_id: clientId,
            location_name: str(data.primary_location_name) || str(data.biz_name) || 'Main location',
            full_address: primaryAddr,
            city: str(data.city),
            state: str(data.state),
            zip: str(data.zip),
            gbp_place_id: str(data.primary_place_id),
            hours: (data.hours as Record<string, unknown>) || null,
            is_primary: true,
          })
        }
        for (const l of cleanLocs) {
          rows.push({
            client_id: clientId,
            location_name: str(l.name) || str(l.full_address),
            full_address: str(l.full_address),
            city: str(l.city),
            state: str(l.state),
            zip: str(l.zip),
            gbp_place_id: str(l.place_id),
            hours: (l.hours as Record<string, unknown>) || null,
            is_primary: false,
          })
        }
        if (rows.length) {
          const { error: locErr } = await supabase.from('client_locations').insert(rows)
          if (locErr) console.error('[completeOnboardingCRM] locations seed error:', locErr.message)
          else console.log(`[completeOnboardingCRM] Seeded ${rows.length} client_locations`)
        }
      }
    }
  } catch (e) {
    console.error('[completeOnboardingCRM] locations seed threw:', e)
  }

  // 2e. Seed restaurant shape + default goals from onboarding answers so the
  //     playbook engine has something to match against the moment onboarding
  //     finishes, instead of leaving /dashboard/restaurant and
  //     /dashboard/goals blank until the owner fills them in by hand. Both are
  //     a best guess the owner can adjust on those pages. Idempotent: we never
  //     overwrite a shape a strategist already captured, and never add goals
  //     when the client already has active ones.
  //
  //     Restaurant-only: the shape dimensions and goal catalog are tuned for
  //     food businesses, so seeding a non-restaurant account (e.g. a
  //     professional-services business dogfooding the platform) would hand it
  //     nonsensical goals like "more foot traffic". Skip seeding for those —
  //     they land with shape/goals blank, which is honest, and can set them by
  //     hand if relevant.
  try {
    const { FOOD_BIZ_TYPES } = await import('@/app/(auth)/onboarding/full/data')
    const isFoodBusiness =
      typeof data.biz_type === 'string' &&
      (FOOD_BIZ_TYPES as readonly string[]).includes(data.biz_type)
    const { inferShapeFromOnboarding, defaultGoalsForShape } = await import('@/lib/goals/defaults')
    const { data: clientRow } = await supabase
      .from('clients')
      .select('shape_captured_at')
      .eq('id', clientId)
      .maybeSingle()

    if (isFoodBusiness && !clientRow?.shape_captured_at) {
      const shape = inferShapeFromOnboarding({
        service_styles: (data.service_styles as string[]) || null,
        price_range: (data.price_range as string) || null,
        location_count: (data.location_count as string) || null,
        locations: (data.locations as unknown[]) || null,
        customer_types: (data.customer_types as string[]) || null,
        connected: (data.connected as Record<string, boolean>) || null,
      })

      const { error: shapeErr } = await supabase
        .from('clients')
        .update({
          shape_footprint: shape.footprint,
          shape_concept: shape.concept,
          shape_customer_mix: shape.customerMix,
          shape_digital_maturity: shape.digitalMaturity,
          shape_captured_at: new Date().toISOString(),
          shape_captured_by: null,
        })
        .eq('id', clientId)
      if (shapeErr) console.error('[completeOnboardingCRM] shape seed error:', shapeErr.message)
      else console.log(`[completeOnboardingCRM] Seeded shape: ${shape.footprint}/${shape.concept}`)

      // Default goals derived from the inferred shape — only when the client
      // has no active goals yet (so a strategist's picks are never clobbered).
      const { count } = await supabase
        .from('client_goals')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', clientId)
        .eq('status', 'active')
      if (!count) {
        const slugs = defaultGoalsForShape({ footprint: shape.footprint, concept: shape.concept })
        const goalRows = slugs.slice(0, 3).map((slug, i) => ({
          client_id: clientId,
          goal_slug: slug,
          priority: i + 1,
          status: 'active',
          set_by: null,
        }))
        if (goalRows.length) {
          const { error: goalErr } = await supabase.from('client_goals').insert(goalRows)
          if (goalErr) console.error('[completeOnboardingCRM] goals seed error:', goalErr.message)
          else console.log(`[completeOnboardingCRM] Seeded ${goalRows.length} default goals`)
        }
      }
    }
  } catch (e) {
    console.error('[completeOnboardingCRM] shape/goals seed threw:', e)
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
