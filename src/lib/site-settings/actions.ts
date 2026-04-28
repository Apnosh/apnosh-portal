'use server'

/**
 * Server actions for managing per-client Apnosh Sites settings.
 * Owns site presentation: hero photo, tagline, brand colors, links.
 */

import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient, SupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminDb = SupabaseClient<any, 'public', any>

function adminDb(): AdminDb {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  ) as AdminDb
}

async function requireAdmin(): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
    return { ok: false, error: 'Admin access required' }
  }
  return { ok: true, userId: user.id }
}

export type SiteType = 'none' | 'apnosh_generated' | 'apnosh_custom' | 'external_repo'

export interface SiteSettings {
  id: string
  clientId: string
  // Site backend type + connection info
  siteType: SiteType
  externalSiteUrl: string | null
  externalRepoUrl: string | null
  externalDeployHookUrl: string | null
  externalApiKey: string | null
  // Publication state
  isPublished: boolean
  customDomain: string | null
  customDomainVerifiedAt: string | null
  // Action links (still needed: not yet on canonical clients table)
  orderOnlineUrl: string | null
  reservationUrl: string | null
  // Legacy / unused but kept for backwards compat
  tagline: string | null
  heroPhotoUrl: string | null
  logoUrl: string | null
  primaryColor: string | null
  accentColor: string | null
  backgroundColor: string | null
  textColor: string | null
  headingFont: string | null
  bodyFont: string | null
  deliveryUrls: Record<string, string>
  instagramUrl: string | null
  facebookUrl: string | null
  tiktokUrl: string | null
}

function rowToSettings(row: Record<string, unknown>): SiteSettings {
  return {
    id: row.id as string,
    clientId: row.client_id as string,
    siteType: ((row.site_type as SiteType | null) ?? 'none'),
    externalSiteUrl: (row.external_site_url as string | null) ?? null,
    externalRepoUrl: (row.external_repo_url as string | null) ?? null,
    externalDeployHookUrl: (row.external_deploy_hook_url as string | null) ?? null,
    externalApiKey: (row.external_api_key as string | null) ?? null,
    tagline: (row.tagline as string | null) ?? null,
    heroPhotoUrl: (row.hero_photo_url as string | null) ?? null,
    logoUrl: (row.logo_url as string | null) ?? null,
    primaryColor: (row.primary_color as string | null) ?? null,
    accentColor: (row.accent_color as string | null) ?? null,
    backgroundColor: (row.background_color as string | null) ?? null,
    textColor: (row.text_color as string | null) ?? null,
    headingFont: (row.heading_font as string | null) ?? null,
    bodyFont: (row.body_font as string | null) ?? null,
    orderOnlineUrl: (row.order_online_url as string | null) ?? null,
    reservationUrl: (row.reservation_url as string | null) ?? null,
    deliveryUrls: (row.delivery_urls as Record<string, string>) ?? {},
    instagramUrl: (row.instagram_url as string | null) ?? null,
    facebookUrl: (row.facebook_url as string | null) ?? null,
    tiktokUrl: (row.tiktok_url as string | null) ?? null,
    isPublished: (row.is_published as boolean) ?? false,
    customDomain: (row.custom_domain as string | null) ?? null,
    customDomainVerifiedAt: (row.custom_domain_verified_at as string | null) ?? null,
  }
}

export async function getSiteSettings(clientId: string): Promise<
  { success: true; data: SiteSettings | null } | { success: false; error: string }
> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  const db = adminDb()
  const { data, error } = await db
    .from('site_settings')
    .select('*')
    .eq('client_id', clientId)
    .maybeSingle()
  if (error) return { success: false, error: error.message }
  return { success: true, data: data ? rowToSettings(data) : null }
}

export interface SiteSettingsInput {
  // Site backend
  siteType?: SiteType
  externalSiteUrl?: string | null
  externalRepoUrl?: string | null
  externalDeployHookUrl?: string | null
  externalApiKey?: string | null
  // Publication
  isPublished?: boolean
  customDomain?: string | null
  // Action links
  orderOnlineUrl?: string | null
  reservationUrl?: string | null
  // Legacy fields (still accepted but deprecated)
  tagline?: string | null
  heroPhotoUrl?: string | null
  logoUrl?: string | null
  primaryColor?: string | null
  accentColor?: string | null
  backgroundColor?: string | null
  textColor?: string | null
  headingFont?: string | null
  bodyFont?: string | null
  deliveryUrls?: Record<string, string>
  instagramUrl?: string | null
  facebookUrl?: string | null
  tiktokUrl?: string | null
}

export async function upsertSiteSettings(
  clientId: string,
  input: SiteSettingsInput,
): Promise<{ success: true; data: SiteSettings } | { success: false; error: string }> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  const db = adminDb()

  // Translate camelCase -> snake_case for DB
  const dbRow: Record<string, unknown> = { client_id: clientId }
  if (input.siteType !== undefined)              dbRow.site_type = input.siteType
  if (input.externalSiteUrl !== undefined)       dbRow.external_site_url = input.externalSiteUrl
  if (input.externalRepoUrl !== undefined)       dbRow.external_repo_url = input.externalRepoUrl
  if (input.externalDeployHookUrl !== undefined) dbRow.external_deploy_hook_url = input.externalDeployHookUrl
  if (input.externalApiKey !== undefined)        dbRow.external_api_key = input.externalApiKey
  if (input.tagline !== undefined)         dbRow.tagline = input.tagline
  if (input.heroPhotoUrl !== undefined)    dbRow.hero_photo_url = input.heroPhotoUrl
  if (input.logoUrl !== undefined)         dbRow.logo_url = input.logoUrl
  if (input.primaryColor !== undefined)    dbRow.primary_color = input.primaryColor
  if (input.accentColor !== undefined)     dbRow.accent_color = input.accentColor
  if (input.backgroundColor !== undefined) dbRow.background_color = input.backgroundColor
  if (input.textColor !== undefined)       dbRow.text_color = input.textColor
  if (input.headingFont !== undefined)     dbRow.heading_font = input.headingFont
  if (input.bodyFont !== undefined)        dbRow.body_font = input.bodyFont
  if (input.orderOnlineUrl !== undefined)  dbRow.order_online_url = input.orderOnlineUrl
  if (input.reservationUrl !== undefined)  dbRow.reservation_url = input.reservationUrl
  if (input.deliveryUrls !== undefined)    dbRow.delivery_urls = input.deliveryUrls
  if (input.instagramUrl !== undefined)    dbRow.instagram_url = input.instagramUrl
  if (input.facebookUrl !== undefined)     dbRow.facebook_url = input.facebookUrl
  if (input.tiktokUrl !== undefined)       dbRow.tiktok_url = input.tiktokUrl
  if (input.isPublished !== undefined)     dbRow.is_published = input.isPublished
  if (input.customDomain !== undefined)    dbRow.custom_domain = input.customDomain

  const { data, error } = await db
    .from('site_settings')
    .upsert(dbRow, { onConflict: 'client_id' })
    .select('*')
    .single()
  if (error) return { success: false, error: error.message }

  // Get client slug for site revalidation
  const { data: client } = await db
    .from('clients')
    .select('slug')
    .eq('id', clientId)
    .maybeSingle()
  if (client?.slug) {
    revalidatePath(`/sites/${client.slug}`)
  }
  revalidatePath(`/admin/clients/${clientId}`)

  return { success: true, data: rowToSettings(data) }
}

/**
 * Public fetcher used by the /sites/[slug] page rendering. No auth
 * required because the page is public.
 */
export async function getPublicSiteSettings(clientId: string): Promise<SiteSettings | null> {
  const db = adminDb()
  const { data } = await db
    .from('site_settings')
    .select('*')
    .eq('client_id', clientId)
    .maybeSingle()
  return data ? rowToSettings(data) : null
}
