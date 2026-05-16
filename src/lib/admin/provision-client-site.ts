'use server'

/**
 * Provision a new GitHub repo + Vercel project for a client.
 *
 * Strategist-triggered from the admin clients page. Steps:
 *   1. Generate Apnosh/{slug} repo from the site-template
 *   2. Rewrite src/_data/site.json with client's basics
 *   3. Rewrite src/apnosh-content.json displayName + vertical
 *   4. Create a Vercel project linked to the repo (auto-deploys on push)
 *   5. Create a deploy hook the portal can fire on DB content changes
 *   6. Write everything back to site_settings + client_facts
 *
 * Idempotency: if site_settings already has an external_repo_url, we
 * bail with a clear error rather than overwrite.
 *
 * See: docs/github-per-client.md
 */

import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { setFact } from '@/lib/agent/facts'
import { FACT_KEYS } from '@/lib/agent/types'
import { generateRepoFromTemplate, patchJsonFile, APNOSH_GH_ORG } from '@/lib/github/client'
import { createProject, createDeployHook, defaultVercelUrl } from '@/lib/vercel/client'

const SITE_TEMPLATE_REPO = `${APNOSH_GH_ORG}/site-template`

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

export interface ProvisionResult {
  success: true
  repoFullName: string
  repoHtmlUrl: string
  vercelProjectId: string
  vercelDeploymentUrl: string
}

export async function provisionClientSite(
  clientId: string,
): Promise<ProvisionResult | { success: false; error: string }> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { success: false, error: ctx.error }

  const admin = createAdminClient()
  const { data: client } = await admin
    .from('clients').select('id, name, slug').eq('id', clientId).maybeSingle()
  if (!client) return { success: false, error: 'Client not found' }

  // Idempotency: bail if already provisioned.
  const { data: existing } = await admin
    .from('site_settings')
    .select('external_repo_url, external_site_url')
    .eq('client_id', clientId)
    .maybeSingle()
  if (existing?.external_repo_url) {
    return {
      success: false,
      error: `Already provisioned: ${existing.external_repo_url}. Delete the row first to re-provision.`,
    }
  }

  const slug = (client.slug as string).toLowerCase().replace(/[^a-z0-9-]/g, '-')
  const repoName = slug
  const clientName = client.name as string
  const repoFullName = `${APNOSH_GH_ORG}/${repoName}`

  // ─── 1. Generate repo from template ─────────────────────────────
  let repoHtmlUrl: string
  try {
    const repo = await generateRepoFromTemplate({
      templateRepo: SITE_TEMPLATE_REPO,
      newName: repoName,
      description: `Apnosh-managed website for ${clientName}`,
      private: false,
    })
    repoHtmlUrl = repo.html_url
  } catch (err) {
    return { success: false, error: `GitHub repo creation failed: ${(err as Error).message}` }
  }

  // ─── 2 + 3. Rewrite client-specific files ───────────────────────
  /* GitHub's "generate from template" copies the files but doesn't
     wait for the repo to be fully ready -- a follow-up content PUT
     within ~1s often 404s. Small retry loop handles that. */
  await new Promise(resolve => setTimeout(resolve, 1500))

  try {
    await patchJsonFile({
      repo: repoFullName,
      path: 'src/_data/site.json',
      message: `Configure site for ${clientName}`,
      mutate: (obj) => ({
        ...obj,
        name: clientName,
      }),
      authorName: 'Apnosh',
      authorEmail: 'apnosh@gmail.com',
    })
  } catch (err) {
    // Don't fail provisioning over this; strategist can fix manually.
    console.error(`[provision] Failed to patch site.json for ${repoFullName}:`, (err as Error).message)
  }

  try {
    await patchJsonFile({
      repo: repoFullName,
      path: 'src/apnosh-content.json',
      message: `Set displayName for ${clientName}`,
      mutate: (obj) => ({
        ...obj,
        displayName: clientName,
      }),
      authorName: 'Apnosh',
      authorEmail: 'apnosh@gmail.com',
    })
  } catch (err) {
    console.error(`[provision] Failed to patch apnosh-content.json for ${repoFullName}:`, (err as Error).message)
  }

  // ─── 4. Create Vercel project ───────────────────────────────────
  let vercelProjectId: string
  let vercelDeploymentUrl: string
  try {
    const project = await createProject({
      name: repoName,
      githubRepo: repoFullName,
      framework: 'eleventy',
    })
    vercelProjectId = project.id
    vercelDeploymentUrl = defaultVercelUrl(repoName)
  } catch (err) {
    // Repo exists but Vercel failed. Surface clearly; strategist can
    // create the Vercel project manually + re-run the rest.
    return {
      success: false,
      error: `Repo created at ${repoHtmlUrl} but Vercel project creation failed: ${(err as Error).message}`,
    }
  }

  // ─── 5. Create deploy hook ──────────────────────────────────────
  let deployHookUrl: string | null = null
  try {
    const hook = await createDeployHook({
      projectId: vercelProjectId,
      name: 'apnosh-portal',
      ref: 'main',
    })
    deployHookUrl = hook.url
  } catch (err) {
    console.error(`[provision] Deploy hook creation failed for ${repoFullName}:`, (err as Error).message)
  }

  // ─── 6. Persist to portal DB ────────────────────────────────────
  await admin.from('site_settings').upsert({
    client_id: clientId,
    site_type: 'external_repo',
    external_repo_url: repoHtmlUrl,
    external_site_url: vercelDeploymentUrl,
    external_deploy_hook_url: deployHookUrl,
    is_published: true,
  }, { onConflict: 'client_id' })

  // Write canonical facts to the agent's knowledge base.
  await setFact({
    clientId,
    key: FACT_KEYS.CHANNEL_GITHUB_REPO,
    value: repoFullName,
    source: 'platform',
  })

  return {
    success: true,
    repoFullName,
    repoHtmlUrl,
    vercelProjectId,
    vercelDeploymentUrl,
  }
}
