'use server'

/**
 * Agency-mode Meta integration helpers.
 *
 * The Apnosh AM authenticates with Facebook once (via /api/auth/instagram-agency).
 * The resulting long-lived token is stored in `integrations` with
 * provider = 'meta_agency'. With that token we can list every Page the
 * AM administers in Meta Business Manager and map them to Apnosh clients.
 *
 * The mapping writes per-client rows into `platform_connections` -- same
 * table the existing analytics pull reads -- so the existing dashboards,
 * sync crons, and Connected Accounts surface keep working without
 * changes. The only difference is the token came from one agency grant
 * instead of N client-side OAuth flows.
 */

import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

interface AdminContext {
  userId: string
}

async function requireAdmin(): Promise<AdminContext> {
  const userSupabase = await createServerClient()
  const { data: { user } } = await userSupabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = createAdminClient()
  const { data } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  if (data?.role !== 'admin' && data?.role !== 'super_admin') {
    throw new Error('Admin only')
  }
  return { userId: user.id }
}

export interface MetaAgencyStatus {
  connected: boolean
  grantedAt: string | null
  expiresAt: string | null
  facebookUserId: string | null
  facebookUserName: string | null
}

export async function getMetaAgencyStatus(): Promise<MetaAgencyStatus> {
  await requireAdmin()
  const admin = createAdminClient()
  const { data } = await admin
    .from('integrations')
    .select('access_token, token_expires_at, metadata, created_at, updated_at')
    .eq('provider', 'meta_agency')
    .maybeSingle()

  if (!data?.access_token) {
    return { connected: false, grantedAt: null, expiresAt: null, facebookUserId: null, facebookUserName: null }
  }

  const meta = (data.metadata ?? {}) as { facebook_user_id?: string; facebook_user_name?: string }
  return {
    connected: true,
    grantedAt: data.created_at,
    expiresAt: data.token_expires_at,
    facebookUserId: meta.facebook_user_id ?? null,
    facebookUserName: meta.facebook_user_name ?? null,
  }
}

export interface AgencyPage {
  id: string
  name: string
  /** Page-scoped access token (each Page has its own). */
  accessToken: string
  /** Instagram Business Account id linked to this Page, if any. */
  instagramId: string | null
  instagramUsername: string | null
  /** Apnosh client this Page is currently mapped to (null = unmapped). */
  mappedClientId: string | null
  mappedClientName: string | null
}

/**
 * Fetch every Page the agency token has admin access to, plus each
 * Page's linked Instagram Business Account, and which Apnosh client
 * it's currently mapped to (if any).
 */
export async function listAgencyPages(): Promise<AgencyPage[]> {
  await requireAdmin()
  const admin = createAdminClient()

  const { data: integration } = await admin
    .from('integrations')
    .select('access_token')
    .eq('provider', 'meta_agency')
    .maybeSingle()

  if (!integration?.access_token) return []

  // 1. Fetch Pages and their linked Instagram Business Accounts.
  const url = new URL('https://graph.facebook.com/v21.0/me/accounts')
  url.searchParams.set('fields', 'id,name,access_token,instagram_business_account{id,username}')
  url.searchParams.set('limit', '100')
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${integration.access_token}` },
  })
  if (!res.ok) return []
  const json = await res.json() as {
    data?: Array<{
      id: string
      name: string
      access_token: string
      instagram_business_account?: { id: string; username?: string }
    }>
  }
  const pages = json.data ?? []

  // 2. Look up which Apnosh clients each Page is mapped to. We use
  //    platform_user_id = facebook_page_id as the join key on
  //    platform_connections rows that came from agency mode.
  const fbIds = pages.map(p => p.id)
  const { data: existingFb } = fbIds.length === 0 ? { data: [] } : await admin
    .from('platform_connections')
    .select('client_id, platform_user_id, clients(name)')
    .in('platform', ['facebook'])
    .in('platform_user_id', fbIds)

  type MappingRow = { client_id: string; platform_user_id: string | null; clients: { name: string | null } | { name: string | null }[] | null }
  const mapping = new Map<string, { id: string; name: string }>()
  for (const row of (existingFb ?? []) as unknown as MappingRow[]) {
    if (!row.platform_user_id) continue
    const clientRow = Array.isArray(row.clients) ? row.clients[0] : row.clients
    mapping.set(row.platform_user_id, { id: row.client_id, name: clientRow?.name ?? '' })
  }

  return pages.map(p => {
    const mapped = mapping.get(p.id) ?? null
    return {
      id: p.id,
      name: p.name,
      accessToken: p.access_token,
      instagramId: p.instagram_business_account?.id ?? null,
      instagramUsername: p.instagram_business_account?.username ?? null,
      mappedClientId: mapped?.id ?? null,
      mappedClientName: mapped?.name ?? null,
    }
  })
}

/**
 * Bind a Facebook Page (and its linked Instagram, if any) to an Apnosh
 * client. Writes per-client rows into platform_connections so the
 * existing analytics pipeline picks them up automatically.
 *
 * Replaces any existing facebook / instagram connection for that
 * client -- one client, one mapping per platform.
 */
export async function mapAgencyPageToClient(input: {
  clientId: string
  pageId: string
}): Promise<{ success: true } | { success: false; error: string }> {
  await requireAdmin()
  const admin = createAdminClient()

  // Refetch the live Page (and IG) details so we always store a
  // current Page access token rather than stale data the AM passed in.
  const { data: integration } = await admin
    .from('integrations')
    .select('access_token, token_expires_at')
    .eq('provider', 'meta_agency')
    .maybeSingle()

  if (!integration?.access_token) {
    return { success: false, error: 'Meta agency token is not connected. Connect at /admin/integrations/meta-agency.' }
  }

  const url = new URL(`https://graph.facebook.com/v21.0/${encodeURIComponent(input.pageId)}`)
  url.searchParams.set('fields', 'id,name,access_token,instagram_business_account{id,username}')
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${integration.access_token}` },
  })
  if (!res.ok) {
    return { success: false, error: `Couldn't reach Facebook Page ${input.pageId}. The agency token may have expired.` }
  }
  const page = await res.json() as {
    id?: string
    name?: string
    access_token?: string
    instagram_business_account?: { id: string; username?: string }
  }
  if (!page.access_token) {
    return { success: false, error: 'Page returned no access_token. Make sure the granting account has Admin role on this Page.' }
  }

  const expiresAt = integration.token_expires_at

  // Replace any prior facebook connection for this client.
  await admin
    .from('platform_connections')
    .delete()
    .eq('client_id', input.clientId)
    .eq('platform', 'facebook')

  await admin
    .from('platform_connections')
    .insert({
      client_id: input.clientId,
      platform: 'facebook',
      platform_user_id: page.id,
      page_id: page.id,
      page_name: page.name,
      access_token: page.access_token,
      expires_at: expiresAt,
      connected_at: new Date().toISOString(),
    })

  // If the Page has a linked Instagram Business Account, mirror it.
  if (page.instagram_business_account?.id) {
    await admin
      .from('platform_connections')
      .delete()
      .eq('client_id', input.clientId)
      .eq('platform', 'instagram')

    await admin
      .from('platform_connections')
      .insert({
        client_id: input.clientId,
        platform: 'instagram',
        platform_user_id: page.instagram_business_account.id,
        username: page.instagram_business_account.username ?? null,
        ig_account_id: page.instagram_business_account.id,
        access_token: page.access_token,  // IG Business reads use Page token
        expires_at: expiresAt,
        connected_at: new Date().toISOString(),
      })
  }

  return { success: true }
}

/**
 * Remove an agency-mapped Page from a client. Tears down both the
 * Facebook and Instagram rows; the analytics pull will stop reading
 * for this client on the next cron run.
 */
export async function unmapAgencyPageFromClient(clientId: string): Promise<{ success: true } | { success: false; error: string }> {
  await requireAdmin()
  const admin = createAdminClient()
  const { error } = await admin
    .from('platform_connections')
    .delete()
    .eq('client_id', clientId)
    .in('platform', ['facebook', 'instagram'])
  if (error) return { success: false, error: error.message }
  return { success: true }
}

/**
 * Lightweight list of Apnosh clients for the mapping dropdown.
 */
export async function listClientsForMapping(): Promise<Array<{ id: string; name: string }>> {
  await requireAdmin()
  const admin = createAdminClient()
  const { data } = await admin
    .from('clients')
    .select('id, name')
    .order('name', { ascending: true })
  return (data ?? []) as Array<{ id: string; name: string }>
}
