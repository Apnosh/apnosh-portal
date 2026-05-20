'use server'

/**
 * Connect / disconnect an owner's own website (Vercel + GitHub) so
 * business-info changes commit an apnosh-content.json into their repo,
 * which their Vercel project auto-deploys and their site reads.
 *
 *   testWebsiteConnection(repo)  — verify Apnosh can write to the repo
 *   saveWebsiteConnection(...)   — persist repo + path + branch, do a
 *                                  first content push
 *   disconnectWebsite()          — clear the connection
 *   getWebsiteConnection()       — current connection state for the UI
 *
 * Write access is via APNOSH_GITHUB_PAT — the owner must grant it
 * collaborator/app access to their repo first (the test step confirms).
 */

import { revalidatePath } from 'next/cache'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRepoAccess, upsertJsonFile } from '@/lib/github/client'
import { loadBusinessInfo } from './actions'

/* Normalize a GitHub repo input to "owner/name". Accepts a full URL
   or the bare "owner/name" form. */
function normalizeRepo(input: string): string | null {
  const trimmed = input.trim().replace(/\.git$/, '')
  const urlMatch = trimmed.match(/github\.com[/:]([^/]+\/[^/]+)/i)
  if (urlMatch) return urlMatch[1]
  if (/^[^/\s]+\/[^/\s]+$/.test(trimmed)) return trimmed
  return null
}

export interface WebsiteConnection {
  connected: boolean
  repo: string | null
  path: string
  branch: string
  connectedAt: string | null
  lastSyncedAt: string | null
}

export async function getWebsiteConnection(): Promise<WebsiteConnection> {
  const { clientId } = await resolveCurrentClient(null)
  const blank: WebsiteConnection = { connected: false, repo: null, path: 'apnosh-content.json', branch: 'main', connectedAt: null, lastSyncedAt: null }
  if (!clientId) return blank
  const admin = createAdminClient()
  const { data } = await admin
    .from('clients')
    .select('website_content_repo, website_content_path, website_content_branch, website_connected_at, website_last_synced_at')
    .eq('id', clientId)
    .maybeSingle() as unknown as { data: { website_content_repo: string | null; website_content_path: string | null; website_content_branch: string | null; website_connected_at: string | null; website_last_synced_at: string | null } | null }
  if (!data) return blank
  return {
    connected: !!data.website_content_repo,
    repo: data.website_content_repo,
    path: data.website_content_path ?? 'apnosh-content.json',
    branch: data.website_content_branch ?? 'main',
    connectedAt: data.website_connected_at,
    lastSyncedAt: data.website_last_synced_at,
  }
}

export async function testWebsiteConnection(repoInput: string): Promise<
  { ok: true; repo: string; canWrite: boolean; defaultBranch: string } | { ok: false; error: string }
> {
  const repo = normalizeRepo(repoInput)
  if (!repo) return { ok: false, error: 'Enter a repo like "yourname/your-website" or a github.com URL.' }
  const access = await checkRepoAccess(repo)
  if (!access.ok) return { ok: false, error: access.error }
  if (!access.canWrite) {
    return { ok: false, error: 'Apnosh can see the repo but can\'t write to it yet. Add Apnosh as a collaborator with write access, then test again.' }
  }
  return { ok: true, repo, canWrite: true, defaultBranch: access.defaultBranch }
}

export async function saveWebsiteConnection(input: {
  repoInput: string
  path?: string
  branch?: string
}): Promise<{ ok: boolean; error?: string; firstPush?: boolean }> {
  const { user, clientId } = await resolveCurrentClient(null)
  if (!user) return { ok: false, error: 'Not authenticated' }
  if (!clientId) return { ok: false, error: 'No client account linked' }

  const repo = normalizeRepo(input.repoInput)
  if (!repo) return { ok: false, error: 'Invalid repo' }

  /* Re-verify access at save time. */
  const access = await checkRepoAccess(repo)
  if (!access.ok) return { ok: false, error: access.error }
  if (!access.canWrite) return { ok: false, error: 'Apnosh needs write access to this repo.' }

  const path = (input.path?.trim() || 'apnosh-content.json')
  const branch = (input.branch?.trim() || access.defaultBranch || 'main')

  const admin = createAdminClient()
  await admin.from('clients').update({
    website_content_repo: repo,
    website_content_path: path,
    website_content_branch: branch,
    website_connected_at: new Date().toISOString(),
  }).eq('id', clientId)

  /* First push — write the current business info so the file exists and
     the site has data immediately. */
  let firstPush = false
  try {
    const loaded = await loadBusinessInfo()
    if (loaded.ok && loaded.info) {
      await upsertJsonFile({
        repo,
        path,
        branch,
        data: { ...loaded.info, updatedAt: new Date().toISOString(), source: 'apnosh' },
        message: 'Apnosh: connect website + sync business info',
      })
      await admin.from('clients').update({ website_last_synced_at: new Date().toISOString() }).eq('id', clientId)
      firstPush = true
    }
  } catch {
    /* Connection saved even if the first push hiccups; next save retries. */
  }

  revalidatePath('/dashboard/business-info')
  return { ok: true, firstPush }
}

export async function disconnectWebsite(): Promise<{ ok: boolean; error?: string }> {
  const { clientId } = await resolveCurrentClient(null)
  if (!clientId) return { ok: false, error: 'No client account linked' }
  const admin = createAdminClient()
  await admin.from('clients').update({
    website_content_repo: null,
    website_connected_at: null,
  }).eq('id', clientId)
  revalidatePath('/dashboard/business-info')
  return { ok: true }
}
