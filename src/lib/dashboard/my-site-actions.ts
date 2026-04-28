'use server'

/**
 * Client-side (dashboard) server actions for managing the restaurant's own site.
 *
 * Auth: any signed-in user with a row in client_users for the target client_id.
 * These wrap the admin updates system but with client-scoped auth.
 *
 * Public functions:
 *   - getMySiteOverview()        -- site type + status + recent updates
 *   - createMyUpdate(args)       -- create + auto-publish a quick update
 */

import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient, SupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { createUpdate, publishUpdate } from '@/lib/updates/actions'
import { getPermission, clientSelfServeTypes } from '@/lib/updates/policy'
import type { UpdateType, UpdatePayload, FanoutTarget, UpdateRecord } from '@/lib/updates/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminDb = SupabaseClient<any, 'public', any>

function adminDb(): AdminDb {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  ) as AdminDb
}

async function requireClientUser(): Promise<
  | { ok: true; userId: string; clientId: string }
  | { ok: false; error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }

  const db = adminDb()
  const { data: cu } = await db
    .from('client_users')
    .select('client_id')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!cu?.client_id) {
    return { ok: false, error: 'No client account associated with this user' }
  }
  return { ok: true, userId: user.id, clientId: cu.client_id as string }
}

// ────────────────────────────────────────────────────────────────
// getMySiteOverview
// ────────────────────────────────────────────────────────────────

export interface MySiteOverview {
  client: { id: string; name: string; slug: string }
  site: {
    siteType: 'none' | 'apnosh_generated' | 'apnosh_custom' | 'external_repo'
    isPublished: boolean
    publicUrl: string | null
    customDomain: string | null
    externalSiteUrl: string | null
  }
  recentUpdates: Array<{
    id: string
    type: string
    summary: string | null
    publishedAt: string | null
    status: string
  }>
  /** Update types the client can publish themselves without admin review. */
  selfServeTypes: UpdateType[]
}

export async function getMySiteOverview(): Promise<
  { success: true; data: MySiteOverview } | { success: false; error: string }
> {
  const auth = await requireClientUser()
  if (!auth.ok) return { success: false, error: auth.error }

  const db = adminDb()
  const { data: client } = await db
    .from('clients')
    .select('id, name, slug')
    .eq('id', auth.clientId)
    .maybeSingle()
  if (!client) return { success: false, error: 'Client not found' }

  const { data: settings } = await db
    .from('site_settings')
    .select('site_type, is_published, custom_domain, external_site_url')
    .eq('client_id', auth.clientId)
    .maybeSingle()

  const siteType = (settings?.site_type as MySiteOverview['site']['siteType']) ?? 'none'
  const externalSiteUrl = (settings?.external_site_url as string | null) ?? null
  const customDomain = (settings?.custom_domain as string | null) ?? null
  const isPublished = (settings?.is_published as boolean) ?? false

  // Pick the public URL based on site_type + publication state
  let publicUrl: string | null = null
  if (siteType === 'external_repo') {
    publicUrl = externalSiteUrl
  } else if (siteType !== 'none' && isPublished) {
    publicUrl = customDomain
      ? `https://${customDomain}`
      : `/sites/${client.slug as string}`
  }

  const { data: updates } = await db
    .from('client_updates')
    .select('id, type, summary, published_at, status')
    .eq('client_id', auth.clientId)
    .order('created_at', { ascending: false })
    .limit(10)

  return {
    success: true,
    data: {
      client: {
        id: client.id as string,
        name: client.name as string,
        slug: client.slug as string,
      },
      site: {
        siteType,
        isPublished,
        publicUrl,
        customDomain,
        externalSiteUrl,
      },
      recentUpdates: (updates ?? []).map(u => ({
        id: u.id as string,
        type: u.type as string,
        summary: (u.summary as string | null) ?? null,
        publishedAt: (u.published_at as string | null) ?? null,
        status: u.status as string,
      })),
      selfServeTypes: clientSelfServeTypes(),
    },
  }
}

// ────────────────────────────────────────────────────────────────
// createMyUpdate -- client creates + publishes a quick update
// ────────────────────────────────────────────────────────────────

export async function createMyUpdate(args: {
  type: UpdateType
  payload: UpdatePayload['data']
  targets?: FanoutTarget[]
  summary?: string
  locationId?: string | null
}): Promise<
  | { success: true; data: { updateId: string } }
  | { success: false; error: string }
> {
  const auth = await requireClientUser()
  if (!auth.ok) return { success: false, error: auth.error }

  // Policy enforcement: only types where client permission is 'direct' can
  // be self-served. Anything else (info, asset, social_post) routes through
  // the change-request flow and is not creatable here.
  const perm = getPermission(args.type, 'client')
  if (perm !== 'direct') {
    return {
      success: false,
      error: perm === 'request'
        ? `${args.type} changes need to go through a change request -- /dashboard/website/requests/new`
        : `${args.type} is not allowed for self-serve`,
    }
  }

  const created = await createUpdate({
    clientId: auth.clientId,
    locationId: args.locationId ?? null,
    type: args.type,
    payload: args.payload,
    targets: args.targets,
    summary: args.summary ?? `${args.type} update from client`,
  })
  if (!created.success) return { success: false, error: created.error }

  const published = await publishUpdate(created.data.id)
  if (!published.success) return { success: false, error: published.error }

  revalidatePath('/dashboard/website/manage')
  revalidatePath(`/sites/${auth.clientId}`)

  return { success: true, data: { updateId: created.data.id } }
}

// ────────────────────────────────────────────────────────────────
// getMyLocations -- the client's GBP locations (for the location picker)
// ────────────────────────────────────────────────────────────────

export interface MyLocation {
  id: string
  name: string
  address: string | null
  hours: Record<string, unknown> | null
  storeCode: string
}

export async function getMyLocations(): Promise<
  { success: true; data: MyLocation[] } | { success: false; error: string }
> {
  const auth = await requireClientUser()
  if (!auth.ok) return { success: false, error: auth.error }

  const db = adminDb()
  const { data, error } = await db
    .from('gbp_locations')
    .select('id, location_name, address, hours, store_code')
    .eq('client_id', auth.clientId)
    .eq('status', 'assigned')
    .order('location_name')
  if (error) return { success: false, error: error.message }

  return {
    success: true,
    data: (data ?? []).map(l => ({
      id: l.id as string,
      name: l.location_name as string,
      address: (l.address as string | null) ?? null,
      hours: l.hours as Record<string, unknown> | null,
      storeCode: l.store_code as string,
    })),
  }
}
