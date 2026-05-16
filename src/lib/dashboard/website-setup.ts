'use server'

/**
 * Server actions for the Connect-your-website wizard at
 * /dashboard/website/setup. Each step writes a small piece of state
 * to the clients (URL, Clarity) or channel_connections (GA, GSC)
 * tables so progress survives a page refresh + the wizard knows
 * which step to resume on next visit.
 *
 * OAuth flows for Google Analytics + Google Search Console are not
 * triggered from here -- the wizard hands off to the existing
 * /api/auth/google and /api/auth/google-search-console routes with
 * returnTo=/dashboard/website/setup. The callbacks redirect to the
 * existing property pickers, which finish with returnTo too.
 */

import { revalidatePath } from 'next/cache'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

interface CtxResult { userId: string; clientId: string }

async function requireClientContext(): Promise<CtxResult | { error: string }> {
  const userSupabase = await createServerClient()
  const { data: { user } } = await userSupabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const admin = createAdminClient()
  const { data: biz } = await admin
    .from('businesses').select('client_id').eq('owner_id', user.id).maybeSingle()
  if (biz?.client_id) return { userId: user.id, clientId: biz.client_id }
  const { data: cu } = await admin
    .from('client_users').select('client_id').eq('auth_user_id', user.id).maybeSingle()
  if (cu?.client_id) return { userId: user.id, clientId: cu.client_id }
  return { error: 'No client context' }
}

export interface WebsiteSetupState {
  clientId: string
  websiteUrl: string | null
  /** Channel-status check: true once we have a working access_token. */
  gaConnected: boolean
  gaAccountName: string | null
  gscConnected: boolean
  gscSiteUrl: string | null
  clarityProjectId: string | null
}

export async function getWebsiteSetupState(): Promise<WebsiteSetupState | null> {
  const ctx = await requireClientContext()
  if ('error' in ctx) return null
  const admin = createAdminClient()

  const [clientRes, chanRes] = await Promise.all([
    admin.from('clients').select('website, clarity_project_id').eq('id', ctx.clientId).maybeSingle(),
    admin.from('channel_connections')
      .select('channel, access_token, status, platform_account_name, platform_url')
      .eq('client_id', ctx.clientId)
      .in('channel', ['google_analytics', 'google_search_console']),
  ])

  const channels = (chanRes.data ?? []) as Array<{
    channel: string; access_token: string | null; status: string
    platform_account_name: string | null; platform_url: string | null
  }>
  const ga = channels.find(c => c.channel === 'google_analytics' && c.access_token && c.status === 'active')
  const gsc = channels.find(c => c.channel === 'google_search_console' && c.access_token && c.status === 'active')

  return {
    clientId: ctx.clientId,
    websiteUrl: (clientRes.data?.website as string | null) ?? null,
    gaConnected: !!ga,
    gaAccountName: ga?.platform_account_name ?? null,
    gscConnected: !!gsc,
    gscSiteUrl: gsc?.platform_url ?? null,
    clarityProjectId: (clientRes.data?.clarity_project_id as string | null) ?? null,
  }
}

export async function saveWebsiteUrl(url: string): Promise<{ success: true } | { success: false; error: string }> {
  const ctx = await requireClientContext()
  if ('error' in ctx) return { success: false, error: ctx.error }
  /* Light normalization: strip whitespace, default to https when no
     scheme. Real URL validation lives client-side. */
  const trimmed = url.trim()
  if (!trimmed) return { success: false, error: 'Enter your website URL' }
  const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    new URL(normalized)
  } catch {
    return { success: false, error: 'That doesn\'t look like a valid URL' }
  }
  const admin = createAdminClient()
  const { error } = await admin
    .from('clients')
    .update({ website: normalized })
    .eq('id', ctx.clientId)
  if (error) return { success: false, error: error.message }
  revalidatePath('/dashboard/website')
  revalidatePath('/dashboard/website/setup')
  return { success: true }
}

export async function refreshWebsiteData(): Promise<
  | { success: true; ga: { synced: boolean; days: number; error?: string }; gsc: { synced: boolean; days: number; error?: string } }
  | { success: false; error: string }
> {
  /* Manual "Refresh data" button: re-runs the GA and GSC sync jobs
     for the current client. The OAuth callbacks already do a 14-day
     backfill, but if that times out (or the user wants fresher data
     mid-day) this gives them a one-click retry. Both syncs run
     serially to stay under Vercel's 60s server-action budget. */
  const ctx = await requireClientContext()
  if ('error' in ctx) return { success: false, error: ctx.error }
  const admin = createAdminClient()
  const { data: rows } = await admin
    .from('channel_connections')
    .select('id, channel, access_token, status')
    .eq('client_id', ctx.clientId)
    .in('channel', ['google_analytics', 'google_search_console'])
    .eq('status', 'active')

  const ga = (rows ?? []).find(r => r.channel === 'google_analytics' && r.access_token)
  const gsc = (rows ?? []).find(r => r.channel === 'google_search_console' && r.access_token)

  const gaResult = { synced: false, days: 0, error: undefined as string | undefined }
  const gscResult = { synced: false, days: 0, error: undefined as string | undefined }

  if (ga) {
    try {
      const { syncGoogleAnalyticsForClient } = await import('@/lib/web-analytics-sync')
      const r = await syncGoogleAnalyticsForClient(ctx.clientId, 14)
      gaResult.synced = r.daysWritten > 0
      gaResult.days = r.daysWritten
      gaResult.error = r.error
    } catch (err) {
      gaResult.error = (err as Error).message
    }
  } else {
    gaResult.error = 'not connected'
  }

  if (gsc) {
    try {
      const { syncSearchConsoleForClient } = await import('@/lib/web-analytics-sync')
      const r = await syncSearchConsoleForClient(ctx.clientId, 14)
      gscResult.synced = r.daysWritten > 0
      gscResult.days = r.daysWritten
      gscResult.error = r.error
    } catch (err) {
      gscResult.error = (err as Error).message
    }
  } else {
    gscResult.error = 'not connected'
  }

  revalidatePath('/dashboard/website')
  revalidatePath('/dashboard/website/traffic')
  return { success: true, ga: gaResult, gsc: gscResult }
}

export async function saveClarityProjectId(projectId: string): Promise<{ success: true } | { success: false; error: string }> {
  const ctx = await requireClientContext()
  if ('error' in ctx) return { success: false, error: ctx.error }
  const trimmed = projectId.trim()
  /* Clarity project IDs are short alphanumeric strings. We allow
     empty as a clear-the-field action. */
  if (trimmed && !/^[a-z0-9]{4,16}$/i.test(trimmed)) {
    return { success: false, error: 'Clarity project IDs are 4-16 letters/numbers' }
  }
  const admin = createAdminClient()
  const { error } = await admin
    .from('clients')
    .update({ clarity_project_id: trimmed || null })
    .eq('id', ctx.clientId)
  if (error) return { success: false, error: error.message }
  revalidatePath('/dashboard/website')
  revalidatePath('/dashboard/website/setup')
  return { success: true }
}
