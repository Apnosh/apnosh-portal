'use server'

/**
 * Install-request handoff: lets a client click "Have us install it"
 * on the website-setup wizard when they hit the wall on Google
 * Analytics / Search Console / Microsoft Clarity. Creates a row in
 * install_requests that the AM team works through at
 * /admin/website-installs.
 *
 * Each (client, tool) can only have one open request at a time --
 * enforced by a partial unique index. Calling requestInstallHelp
 * twice is a safe no-op (returns the existing row).
 */

import { revalidatePath } from 'next/cache'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type InstallTool = 'google_analytics' | 'search_console' | 'clarity'
export type InstallStatus = 'open' | 'in_progress' | 'done' | 'cancelled'

const TOOL_LABEL: Record<InstallTool, string> = {
  google_analytics: 'Google Analytics',
  search_console: 'Search Console',
  clarity: 'Microsoft Clarity',
}

export interface InstallRequest {
  id: string
  clientId: string
  clientName: string
  websiteUrl: string | null
  tool: InstallTool
  toolLabel: string
  status: InstallStatus
  platform: string | null
  notes: string | null
  createdAt: string
  doneAt: string | null
}

async function requireClientContext(): Promise<{ userId: string; clientId: string } | { error: string }> {
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

/* ── Platform detection ───────────────────────────────────────────
 *
 * We sniff the website's homepage for telltale generator tags, CSS
 * class signatures, and bundled-script patterns. Errs on the side of
 * "unknown" rather than guessing wrong; the AM can fix it manually.
 */
export async function detectSitePlatform(url: string): Promise<{
  platform: 'wordpress' | 'squarespace' | 'wix' | 'shopify' | 'webflow' | 'eleventy' | 'next' | 'custom' | 'unknown'
  evidence: string | null
}> {
  try {
    const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`
    const r = await fetch(normalized, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'ApnoshPortal/1.0 (+platform-detector)' },
    })
    if (!r.ok) return { platform: 'unknown', evidence: `HTTP ${r.status}` }
    const html = (await r.text()).slice(0, 200_000)

    // Generator meta is the cleanest signal when present.
    const gen = html.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)["']/i)?.[1]?.toLowerCase()
    if (gen?.includes('wordpress')) return { platform: 'wordpress', evidence: `generator: ${gen}` }
    if (gen?.includes('squarespace')) return { platform: 'squarespace', evidence: `generator: ${gen}` }
    if (gen?.includes('wix')) return { platform: 'wix', evidence: `generator: ${gen}` }
    if (gen?.includes('shopify')) return { platform: 'shopify', evidence: `generator: ${gen}` }
    if (gen?.includes('webflow')) return { platform: 'webflow', evidence: `generator: ${gen}` }
    if (gen?.includes('eleventy') || gen?.includes('11ty')) return { platform: 'eleventy', evidence: `generator: ${gen}` }
    if (gen?.includes('next.js')) return { platform: 'next', evidence: `generator: ${gen}` }

    // Fallback: script src signatures.
    if (/cdn\.shopify\.com|myshopify\.com/i.test(html)) return { platform: 'shopify', evidence: 'shopify cdn' }
    if (/static1?\.squarespace\.com/i.test(html)) return { platform: 'squarespace', evidence: 'squarespace cdn' }
    if (/static\.parastorage\.com|wixstatic/i.test(html)) return { platform: 'wix', evidence: 'wix cdn' }
    if (/wp-content\/|wp-includes\//i.test(html)) return { platform: 'wordpress', evidence: 'wp-content path' }
    if (/website-files\.com|webflow\.com/i.test(html)) return { platform: 'webflow', evidence: 'webflow cdn' }
    if (/_next\/static|__NEXT_DATA__/i.test(html)) return { platform: 'next', evidence: 'next bundle' }

    return { platform: 'custom', evidence: null }
  } catch (err) {
    return { platform: 'unknown', evidence: (err as Error).message }
  }
}

/* ── Client-facing actions ───────────────────────────────────────── */

export async function requestInstallHelp(
  tool: InstallTool,
  notes?: string,
): Promise<{ success: true; alreadyRequested: boolean } | { success: false; error: string }> {
  const ctx = await requireClientContext()
  if ('error' in ctx) return { success: false, error: ctx.error }
  const admin = createAdminClient()

  // De-dupe: if there's already an open request for this (client, tool), return it.
  const { data: existing } = await admin
    .from('install_requests')
    .select('id')
    .eq('client_id', ctx.clientId)
    .eq('tool', tool)
    .in('status', ['open', 'in_progress'])
    .maybeSingle()
  if (existing) return { success: true, alreadyRequested: true }

  // Get the website URL so the AM has it at hand.
  const { data: clientRow } = await admin
    .from('clients').select('website').eq('id', ctx.clientId).maybeSingle()
  const websiteUrl = (clientRow?.website as string | null) ?? null

  // Auto-detect platform (best-effort; non-blocking on failure).
  let platform: string | null = null
  if (websiteUrl) {
    const detected = await detectSitePlatform(websiteUrl)
    platform = detected.platform
  }

  const { error } = await admin.from('install_requests').insert({
    client_id: ctx.clientId,
    tool,
    status: 'open',
    platform,
    website_url: websiteUrl,
    notes: notes ?? null,
  })
  if (error) return { success: false, error: error.message }

  revalidatePath('/dashboard/website/setup')
  revalidatePath('/admin/website-installs')
  return { success: true, alreadyRequested: false }
}

export async function getMyInstallRequests(): Promise<InstallRequest[]> {
  const ctx = await requireClientContext()
  if ('error' in ctx) return []
  const admin = createAdminClient()
  const { data } = await admin
    .from('install_requests')
    .select('id, client_id, tool, status, platform, website_url, notes, created_at, done_at')
    .eq('client_id', ctx.clientId)
    .order('created_at', { ascending: false })
  return ((data ?? []) as Array<{
    id: string; client_id: string; tool: InstallTool; status: InstallStatus;
    platform: string | null; website_url: string | null; notes: string | null;
    created_at: string; done_at: string | null;
  }>).map(r => ({
    id: r.id,
    clientId: r.client_id,
    clientName: '',
    websiteUrl: r.website_url,
    tool: r.tool,
    toolLabel: TOOL_LABEL[r.tool],
    status: r.status,
    platform: r.platform,
    notes: r.notes,
    createdAt: r.created_at,
    doneAt: r.done_at,
  }))
}

/* ── Admin actions ──────────────────────────────────────────────── */

async function requireAdmin(): Promise<{ userId: string } | { error: string }> {
  const userSupabase = await createServerClient()
  const { data: { user } } = await userSupabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'admin') return { error: 'Admin required' }
  return { userId: user.id }
}

export async function listAllInstallRequests(): Promise<InstallRequest[]> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return []
  const admin = createAdminClient()
  const { data } = await admin
    .from('install_requests')
    .select('id, client_id, tool, status, platform, website_url, notes, created_at, done_at, clients(name)')
    .order('created_at', { ascending: false })
    .limit(200)
  return ((data ?? []) as unknown as Array<{
    id: string; client_id: string; tool: InstallTool; status: InstallStatus;
    platform: string | null; website_url: string | null; notes: string | null;
    created_at: string; done_at: string | null;
    clients: { name: string } | Array<{ name: string }> | null;
  }>).map(r => ({
    id: r.id,
    clientId: r.client_id,
    clientName: Array.isArray(r.clients)
      ? (r.clients[0]?.name ?? 'Unknown client')
      : (r.clients?.name ?? 'Unknown client'),
    websiteUrl: r.website_url,
    tool: r.tool,
    toolLabel: TOOL_LABEL[r.tool],
    status: r.status,
    platform: r.platform,
    notes: r.notes,
    createdAt: r.created_at,
    doneAt: r.done_at,
  }))
}

export async function updateInstallRequestStatus(
  id: string,
  status: InstallStatus,
): Promise<{ success: true } | { success: false; error: string }> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { success: false, error: ctx.error }
  const admin = createAdminClient()
  const update: Record<string, unknown> = { status }
  if (status === 'done') {
    update.done_at = new Date().toISOString()
    update.done_by = ctx.userId
  }
  const { error } = await admin.from('install_requests').update(update).eq('id', id)
  if (error) return { success: false, error: error.message }
  revalidatePath('/admin/website-installs')
  return { success: true }
}
