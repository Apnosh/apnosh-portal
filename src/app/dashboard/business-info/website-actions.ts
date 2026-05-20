'use server'

/**
 * Connect / disconnect an owner's own website (Vercel/GitHub).
 *
 * These sites already pull fresh data from
 * portal.apnosh.com/api/public/sites/[slug] at build time (see the
 * site's src/_data/apnosh.js). So "connecting" a site means storing a
 * Vercel DEPLOY HOOK URL — when business info changes, we POST to the
 * hook, Vercel rebuilds, and the rebuild re-fetches our API.
 *
 * No GitHub file commits needed: the data lives in our DB and is
 * served by the public API; the deploy hook is just the rebuild
 * trigger. State lives in site_settings (site_type +
 * external_deploy_hook_url), matching update-page-copy / menu-actions.
 */

import { revalidatePath } from 'next/cache'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { createAdminClient } from '@/lib/supabase/admin'

export interface WebsiteConnection {
  connected: boolean
  deployHookUrl: string | null
  siteUrl: string | null
  slug: string | null
  lastSyncedAt: string | null
}

function isValidHook(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && /vercel\.com|vercel\.app/.test(u.hostname)
  } catch {
    return false
  }
}

export async function getWebsiteConnection(): Promise<WebsiteConnection> {
  const { clientId } = await resolveCurrentClient(null)
  const blank: WebsiteConnection = { connected: false, deployHookUrl: null, siteUrl: null, slug: null, lastSyncedAt: null }
  if (!clientId) return blank
  const admin = createAdminClient()

  const [settingsRes, clientRes] = await Promise.all([
    admin
      .from('site_settings')
      .select('external_deploy_hook_url, external_site_url, site_type')
      .eq('client_id', clientId)
      .maybeSingle() as unknown as Promise<{ data: { external_deploy_hook_url: string | null; external_site_url: string | null; site_type: string | null } | null }>,
    admin
      .from('clients')
      .select('slug, website_last_synced_at')
      .eq('id', clientId)
      .maybeSingle() as unknown as Promise<{ data: { slug: string | null; website_last_synced_at: string | null } | null }>,
  ])

  const s = settingsRes.data
  return {
    connected: !!s?.external_deploy_hook_url,
    deployHookUrl: s?.external_deploy_hook_url ?? null,
    siteUrl: s?.external_site_url ?? null,
    slug: clientRes.data?.slug ?? null,
    lastSyncedAt: clientRes.data?.website_last_synced_at ?? null,
  }
}

/* Fire the deploy hook to verify it triggers a real build. */
export async function testWebsiteConnection(hookUrl: string): Promise<{ ok: boolean; error?: string }> {
  if (!isValidHook(hookUrl)) {
    return { ok: false, error: 'That doesn\'t look like a Vercel deploy hook URL. It should start with https://api.vercel.com/...' }
  }
  try {
    const res = await fetch(hookUrl, { method: 'POST' })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return { ok: false, error: `Hook returned ${res.status}. ${body.slice(0, 120)}` }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not reach the deploy hook' }
  }
}

export async function saveWebsiteConnection(input: {
  hookUrl: string
  siteUrl?: string
}): Promise<{ ok: boolean; error?: string }> {
  const { clientId } = await resolveCurrentClient(null)
  if (!clientId) return { ok: false, error: 'No client account linked' }
  if (!isValidHook(input.hookUrl)) return { ok: false, error: 'Invalid deploy hook URL' }

  const admin = createAdminClient()

  /* Upsert site_settings for this client. */
  const { data: existing } = await admin
    .from('site_settings')
    .select('id')
    .eq('client_id', clientId)
    .maybeSingle() as unknown as { data: { id: string } | null }

  const patch = {
    site_type: 'external_repo',
    external_deploy_hook_url: input.hookUrl.trim(),
    ...(input.siteUrl?.trim() ? { external_site_url: input.siteUrl.trim() } : {}),
    is_published: true,
  }

  if (existing?.id) {
    await admin.from('site_settings').update(patch).eq('id', existing.id)
  } else {
    await admin.from('site_settings').insert({ client_id: clientId, ...patch })
  }

  /* Fire once so the site rebuilds with current data immediately. */
  try {
    await fetch(input.hookUrl, { method: 'POST' })
    await admin.from('clients').update({ website_last_synced_at: new Date().toISOString() }).eq('id', clientId)
  } catch { /* non-fatal */ }

  revalidatePath('/dashboard/business-info')
  return { ok: true }
}

export async function disconnectWebsite(): Promise<{ ok: boolean; error?: string }> {
  const { clientId } = await resolveCurrentClient(null)
  if (!clientId) return { ok: false, error: 'No client account linked' }
  const admin = createAdminClient()
  await admin
    .from('site_settings')
    .update({ external_deploy_hook_url: null, site_type: 'none' })
    .eq('client_id', clientId)
  revalidatePath('/dashboard/business-info')
  return { ok: true }
}
