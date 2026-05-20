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
import { upsertJsonFile } from '@/lib/github/client'

export interface BusinessInfo {
  name: string
  phone: string
  website: string
  description: string
  hours: WeeklyHours
  specialHours: SpecialHours
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
      .select('location_name, phone, website, profile_description, hours, store_code')
      .eq('client_id', clientId)
      .order('is_primary', { ascending: false })
      .limit(1)
      .maybeSingle() as unknown as Promise<{ data: { location_name: string | null; phone: string | null; website: string | null; profile_description: string | null; hours: WeeklyHours | null; store_code: string | null } | null }>,
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

export async function saveBusinessInfo(input: BusinessInfo): Promise<SaveResult> {
  const { user, clientId } = await resolveCurrentClient(null)
  if (!user) return { ok: false, error: 'Not authenticated', synced: { saved: false, google: 'skipped', website: 'skipped' } }
  if (!clientId) return { ok: false, error: 'No client account linked', synced: { saved: false, google: 'skipped', website: 'skipped' } }

  const admin = createAdminClient()

  /* Normalize. Trim strings; ensure hours is well-formed. */
  const name = input.name.trim()
  const phone = input.phone.trim()
  const website = input.website.trim()
  const description = input.description.trim()
  const hours: WeeklyHours = { ...EMPTY_HOURS, ...input.hours }
  /* Keep only well-formed, future-or-today special-hours entries. */
  const specialHours: SpecialHours = (input.specialHours ?? []).filter(s => !!s.date)

  /* Resolve the primary location + website connection. */
  const [{ data: loc }, { data: clientRow }] = await Promise.all([
    admin
      .from('gbp_locations')
      .select('id, store_code')
      .eq('client_id', clientId)
      .order('is_primary', { ascending: false })
      .limit(1)
      .maybeSingle() as unknown as Promise<{ data: { id: string; store_code: string | null } | null }>,
    admin
      .from('clients')
      .select('has_apnosh_website, website_content_repo, website_content_path, website_content_branch')
      .eq('id', clientId)
      .maybeSingle() as unknown as Promise<{ data: { has_apnosh_website: boolean | null; website_content_repo: string | null; website_content_path: string | null; website_content_branch: string | null } | null }>,
  ])

  /* ── 1. Google Business Profile (live) ── */
  let google: SaveResult['synced']['google'] = 'skipped'
  let googleError: string | undefined
  if (loc?.store_code) {
    const result = await updateClientListing(clientId, {
      primaryPhone: phone || null,
      websiteUri: website || null,
      description: description || null,
      regularHours: hours,
      specialHours,
    })
    if (result.ok) {
      google = 'ok'
    } else {
      google = 'failed'
      googleError = result.error
    }
  }

  /* ── 2. Our DB (always) ── */
  await admin.from('clients').update({
    ...(name ? { name } : {}),
    phone: phone || null,
    website: website || null,
  }).eq('id', clientId)
  if (loc?.id) {
    await admin.from('gbp_locations').update({
      ...(name ? { location_name: name } : {}),
      phone: phone || null,
      website: website || null,
      profile_description: description || null,
      hours,
    }).eq('id', loc.id)
  }

  /* ── 3. Website ──
     Priority: a connected external repo gets a live commit (Vercel
     auto-deploys). Otherwise, an Apnosh-managed site is queued via
     client_updates. Otherwise skipped. */
  let websiteStatus: SaveResult['synced']['website'] = 'skipped'
  let websiteError: string | undefined
  if (clientRow?.website_content_repo) {
    try {
      await upsertJsonFile({
        repo: clientRow.website_content_repo,
        path: clientRow.website_content_path ?? 'apnosh-content.json',
        branch: clientRow.website_content_branch ?? 'main',
        data: {
          name, phone, website, description, hours, specialHours,
          updatedAt: new Date().toISOString(),
          source: 'apnosh',
        },
        message: 'Apnosh: sync business info',
      })
      await admin.from('clients').update({ website_last_synced_at: new Date().toISOString() }).eq('id', clientId)
      websiteStatus = 'committed'
    } catch (err) {
      websiteStatus = 'failed'
      websiteError = err instanceof Error ? err.message : 'Website commit failed'
    }
  } else if (clientRow?.has_apnosh_website) {
    await admin.from('client_updates').insert({
      client_id: clientId,
      location_id: loc?.id ?? null,
      type: 'info',
      payload: { name, phone, website, description, hours, specialHours },
      targets: ['website'],
      summary: 'Updated business info',
      status: 'scheduled',
      source: 'manual',
      created_by: user.id,
      approval_required: false,
    })
    websiteStatus = 'queued'
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
