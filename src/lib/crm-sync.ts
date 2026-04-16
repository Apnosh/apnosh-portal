'use server'

import { createAdminClient } from '@/lib/supabase/admin'

// ---------------------------------------------------------------------------
// Shared CRM sync — single write path for client_profiles
// ---------------------------------------------------------------------------

export type ClientProfileData = {
  user_role?: string | null
  business_type?: string | null
  business_type_other?: string | null
  business_description?: string | null
  unique_differentiator?: string | null
  competitors?: string | null
  cuisine?: string | null
  cuisine_other?: string | null
  service_styles?: string[] | null
  full_address?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  location_count?: string | null
  hours?: Record<string, unknown> | null
  website_url?: string | null
  business_phone?: string | null
  customer_types?: string[] | null
  why_choose?: string[] | null
  primary_goal?: string | null
  goal_detail?: string | null
  success_signs?: string[] | null
  timeline?: string | null
  main_offerings?: string | null
  upcoming_events?: string | null
  tone_tags?: string[] | null
  custom_tone?: string | null
  content_type_tags?: string[] | null
  reference_accounts?: string | null
  avoid_content_tags?: string[] | null
  approval_type?: string | null
  can_film?: string[] | null
  can_tag?: string | null
  platforms_connected?: Record<string, boolean> | null
  logo_url?: string | null
  brand_color_primary?: string | null
  brand_color_secondary?: string | null
  brand_drive?: string | null
  onboarding_complete?: boolean
  onboarding_step?: number
  agreed_terms?: boolean
  agreed_terms_at?: string | null
  onboarding_completed_at?: string | null
}

/**
 * Atomic upsert of client_profiles. Only writes fields that are explicitly
 * provided (not undefined). Uses onConflict so concurrent calls are safe.
 */
export async function upsertClientProfile(
  clientId: string,
  data: ClientProfileData
): Promise<{ success: boolean; error?: string }> {
  const supabase = createAdminClient()

  // Strip undefined values so we never overwrite with null accidentally
  const cleaned: Record<string, unknown> = { client_id: clientId }
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) cleaned[key] = value
  }

  const { error } = await supabase
    .from('client_profiles')
    .upsert(cleaned, { onConflict: 'client_id' })

  if (error) {
    console.error('[upsertClientProfile] Error:', error.message)
    return { success: false, error: error.message }
  }
  return { success: true }
}

/**
 * Ensures a minimal client_profiles row exists. Idempotent — does nothing
 * if the row already exists. Used by admin create and invite flows.
 */
export async function ensureClientProfile(clientId: string): Promise<void> {
  const supabase = createAdminClient()

  const { data: existing } = await supabase
    .from('client_profiles')
    .select('id')
    .eq('client_id', clientId)
    .maybeSingle()

  if (existing) return

  const { error } = await supabase
    .from('client_profiles')
    .insert({ client_id: clientId })

  if (error && !error.message.includes('duplicate')) {
    console.error('[ensureClientProfile] Error:', error.message)
  }
}

/**
 * Reads a businesses row and syncs its data to the corresponding
 * client_profiles record. Creates the profile if it doesn't exist.
 * Call this after dashboard profile saves.
 */
export async function syncBusinessToClientProfile(businessId: string): Promise<void> {
  const supabase = createAdminClient()

  const { data: biz } = await supabase
    .from('businesses')
    .select('*')
    .eq('id', businessId)
    .single()

  if (!biz || !biz.client_id) {
    console.warn('[syncBusiness] No business or no client_id for:', businessId)
    return
  }

  const colors = (biz.brand_colors || {}) as { primary?: string; secondary?: string }

  const profileData: ClientProfileData = {
    user_role: biz.user_role || null,
    business_type: biz.industry || null,
    business_type_other: biz.industry_other || null,
    business_description: biz.description || null,
    unique_differentiator: biz.differentiator || null,
    competitors: Array.isArray(biz.competitors)
      ? (biz.competitors as string[]).join(', ')
      : null,
    cuisine: biz.cuisine || null,
    cuisine_other: biz.cuisine_other || null,
    service_styles: biz.service_styles || null,
    full_address: biz.address || null,
    city: biz.city || null,
    state: biz.state || null,
    zip: biz.zip || null,
    location_count: biz.location_count || null,
    hours: biz.business_hours || null,
    website_url: biz.website_url || null,
    business_phone: biz.phone || null,
    customer_types: biz.customer_types || null,
    why_choose: biz.why_choose || null,
    primary_goal: biz.primary_goal || null,
    goal_detail: biz.goal_detail || null,
    success_signs: biz.success_signs || null,
    timeline: biz.timeline || null,
    main_offerings: biz.main_offerings || null,
    upcoming_events: biz.upcoming || null,
    tone_tags: Array.isArray(biz.brand_voice_words) ? biz.brand_voice_words as string[] : null,
    custom_tone: biz.brand_tone || null,
    content_type_tags: biz.content_likes || null,
    reference_accounts: biz.ref_accounts || null,
    avoid_content_tags: biz.avoid_list || null,
    approval_type: biz.approval_type || null,
    can_film: biz.can_film || null,
    can_tag: biz.can_tag || null,
    brand_color_primary: colors.primary || null,
    brand_color_secondary: colors.secondary || null,
    brand_drive: biz.brand_drive || null,
  }

  await upsertClientProfile(biz.client_id, profileData)
}
