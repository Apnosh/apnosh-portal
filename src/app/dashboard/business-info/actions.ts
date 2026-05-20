'use server'

/**
 * Update business info — the functional core of the "Update business
 * info" quick action.
 *
 * loadBusinessInfo() reads the current values from our synced DB.
 * saveBusinessInfo() fans the change out to every place that matters:
 *   1. Google Business Profile  (live, via Business Information API)
 *   2. Our DB                   (gbp_locations + clients, so the
 *                                dashboard reflects it instantly)
 *   3. The website              (queued via client_updates so the
 *                                website-sync pipeline picks it up —
 *                                only when the client has an Apnosh
 *                                managed site)
 *
 * Returns a per-destination status so the UI can show exactly what
 * synced ("Google ✓ · Website ✓ · Saved ✓").
 */

import { revalidatePath } from 'next/cache'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { createAdminClient } from '@/lib/supabase/admin'
import { updateClientListing, getClientListing, type WeeklyHours, type SpecialHours } from '@/lib/gbp-listing'
import { EMPTY_LINKS } from './constants'

export interface LinkEntry {
  label: string
  url: string
}

export interface BusinessLinks {
  ordering: LinkEntry[]
  reservations: LinkEntry[]
  social: {
    instagram?: string
    facebook?: string
    tiktok?: string
    youtube?: string
    x?: string
  }
}

export interface BusinessInfo {
  name: string
  phone: string
  website: string
  description: string
  hours: WeeklyHours
  specialHours: SpecialHours
  links: BusinessLinks
}

export interface LoadResult {
  ok: boolean
  error?: string
  info?: BusinessInfo
  /* Whether a GBP location is connected (so the UI can note that
     changes will sync to Google). */
  gbpConnected: boolean
  /* Whether the client has an Apnosh-managed website. */
  hasWebsite: boolean
}

const EMPTY_HOURS: WeeklyHours = { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] }

export async function loadBusinessInfo(): Promise<LoadResult> {
  const { user, clientId } = await resolveCurrentClient(null)
  if (!user) return { ok: false, error: 'Not authenticated', gbpConnected: false, hasWebsite: false }
  if (!clientId) return { ok: false, error: 'No client account linked', gbpConnected: false, hasWebsite: false }

  const admin = createAdminClient()

  const [clientRes, locRes] = await Promise.all([
    admin
      .from('clients')
      .select('name, phone, website, has_apnosh_website')
      .eq('id', clientId)
      .maybeSingle() as unknown as Promise<{ data: { name: string | null; phone: string | null; website: string | null; has_apnosh_website: boolean | null } | null }>,
    admin
      .from('gbp_locations')
      .select('location_name, phone, website, profile_description, hours, store_code, links')
      .eq('client_id', clientId)
      .order('is_primary', { ascending: false })
      .limit(1)
      .maybeSingle() as unknown as Promise<{ data: { location_name: string | null; phone: string | null; website: string | null; profile_description: string | null; hours: WeeklyHours | null; store_code: string | null; links: BusinessLinks | null } | null }>,
  ])

  const c = clientRes.data
  const loc = locRes.data

  /* Special hours are the source-of-truth on GBP, not mirrored in our
     DB. Load them best-effort so the editor shows the real list and a
     save doesn't clobber existing holiday entries. If GBP is down or
     not connected, we fall back to empty + the UI notes it. */
  let specialHours: SpecialHours = []
  if (loc?.store_code) {
    try {
      const listing = await getClientListing(clientId, null)
      if (listing.ok && listing.fields.specialHours) {
        specialHours = listing.fields.specialHours
      }
    } catch { /* best-effort */ }
  }

  const info: BusinessInfo = {
    name: c?.name ?? loc?.location_name ?? '',
    phone: loc?.phone ?? c?.phone ?? '',
    website: loc?.website ?? c?.website ?? '',
    description: loc?.profile_description ?? '',
    hours: (loc?.hours && typeof loc.hours === 'object') ? { ...EMPTY_HOURS, ...loc.hours } : EMPTY_HOURS,
    specialHours,
    links: (loc?.links && typeof loc.links === 'object')
      ? { ...EMPTY_LINKS, ...loc.links, social: { ...loc.links.social } }
      : EMPTY_LINKS,
  }

  return {
    ok: true,
    info,
    gbpConnected: !!loc?.store_code,
    hasWebsite: !!c?.has_apnosh_website,
  }
}

export interface SaveResult {
  ok: boolean
  error?: string
  /* Per-destination outcome for the success UI. */
  synced: {
    saved: boolean             // our DB
    google: 'ok' | 'failed' | 'skipped'
    website: 'committed' | 'queued' | 'failed' | 'skipped'
  }
  googleError?: string
  websiteError?: string
}

export async function saveBusinessInfo(input: Partial<BusinessInfo>): Promise<SaveResult> {
  const { user, clientId } = await resolveCurrentClient(null)
  if (!user) return { ok: false, error: 'Not authenticated', synced: { saved: false, google: 'skipped', website: 'skipped' } }
  if (!clientId) return { ok: false, error: 'No client account linked', synced: { saved: false, google: 'skipped', website: 'skipped' } }

  const admin = createAdminClient()

  /* Partial update: only fields present in `input` are touched. A
     focused editor (e.g. just Hours) sends only its slice and never
     clobbers the rest. Track which fields are provided. */
  const hasName = input.name !== undefined
  const hasPhone = input.phone !== undefined
  const hasWebsite = input.website !== undefined
  const hasDescription = input.description !== undefined
  const hasHours = input.hours !== undefined
  const hasSpecial = input.specialHours !== undefined
  const hasLinks = input.links !== undefined

  const name = (input.name ?? '').trim()
  const phone = (input.phone ?? '').trim()
  const website = (input.website ?? '').trim()
  const description = (input.description ?? '').trim()
  const hours: WeeklyHours | undefined = hasHours ? { ...EMPTY_HOURS, ...input.hours } : undefined
  const specialHours: SpecialHours | undefined = hasSpecial
    ? (input.specialHours ?? []).filter(s => !!s.date)
    : undefined

  /* Resolve the primary location + website deploy hook. */
  const [{ data: loc }, { data: settings }] = await Promise.all([
    admin
      .from('gbp_locations')
      .select('id, store_code')
      .eq('client_id', clientId)
      .order('is_primary', { ascending: false })
      .limit(1)
      .maybeSingle() as unknown as Promise<{ data: { id: string; store_code: string | null } | null }>,
    admin
      .from('site_settings')
      .select('site_type, external_deploy_hook_url')
      .eq('client_id', clientId)
      .maybeSingle() as unknown as Promise<{ data: { site_type: string | null; external_deploy_hook_url: string | null } | null }>,
  ])

  /* ── 1. Google Business Profile (live) — only the provided fields ── */
  let google: SaveResult['synced']['google'] = 'skipped'
  let googleError: string | undefined
  if (loc?.store_code) {
    const patch: Parameters<typeof updateClientListing>[1] = {}
    if (hasPhone) patch.primaryPhone = phone || null
    if (hasWebsite) patch.websiteUri = website || null
    if (hasDescription) patch.description = description || null
    if (hasHours && hours) patch.regularHours = hours
    if (hasSpecial && specialHours) patch.specialHours = specialHours
    if (Object.keys(patch).length > 0) {
      const result = await updateClientListing(clientId, patch)
      if (result.ok) google = 'ok'
      else { google = 'failed'; googleError = result.error }
    }
  }

  /* ── 2. Our DB — only the provided columns ── */
  const clientPatch: Record<string, unknown> = {}
  if (hasName && name) clientPatch.name = name
  if (hasPhone) clientPatch.phone = phone || null
  if (hasWebsite) clientPatch.website = website || null
  if (Object.keys(clientPatch).length > 0) {
    await admin.from('clients').update(clientPatch).eq('id', clientId)
  }
  if (loc?.id) {
    const locPatch: Record<string, unknown> = {}
    if (hasName && name) locPatch.location_name = name
    if (hasPhone) locPatch.phone = phone || null
    if (hasWebsite) locPatch.website = website || null
    if (hasDescription) locPatch.profile_description = description || null
    if (hasHours && hours) locPatch.hours = hours
    /* The public sites API serves special_hours to the website. */
    if (hasSpecial && specialHours) locPatch.special_hours = specialHours
    /* Order/reserve/social links — served to the website too. */
    if (hasLinks && input.links) locPatch.links = input.links
    if (Object.keys(locPatch).length > 0) {
      await admin.from('gbp_locations').update(locPatch).eq('id', loc.id)
    }
  }

  /* ── 3. Website ──
     The owner's site pulls fresh data from our public API on rebuild.
     So we just fire the Vercel deploy hook (if connected) to trigger
     that rebuild. The data is already in our DB above. */
  let websiteStatus: SaveResult['synced']['website'] = 'skipped'
  let websiteError: string | undefined
  if (settings?.external_deploy_hook_url) {
    try {
      const res = await fetch(settings.external_deploy_hook_url, { method: 'POST' })
      if (res.ok) {
        await admin.from('clients').update({ website_last_synced_at: new Date().toISOString() }).eq('id', clientId)
        websiteStatus = 'committed'
      } else {
        websiteStatus = 'failed'
        websiteError = `Deploy hook returned ${res.status}`
      }
    } catch (err) {
      websiteStatus = 'failed'
      websiteError = err instanceof Error ? err.message : 'Deploy hook failed'
    }
  }

  /* Refresh surfaces that show this data. */
  revalidatePath('/dashboard/business-info')
  revalidatePath('/dashboard/local-seo/listing')
  revalidatePath('/dashboard')

  return {
    ok: google !== 'failed',
    error: google === 'failed' ? `Saved, but Google sync failed: ${googleError}` : undefined,
    synced: { saved: true, google, website: websiteStatus },
    googleError,
    websiteError,
  }
}
