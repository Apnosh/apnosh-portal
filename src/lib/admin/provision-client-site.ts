'use server'

/**
 * Provision a new GitHub repo + Vercel project for a client.
 *
 * Strategist-triggered from the admin clients page. Forks the
 * Apnosh/site-template repo, names it Apnosh/{slug}, hooks up Vercel
 * with auto-deploy on push, and writes back to site_settings so the
 * portal knows about it.
 *
 * THIS IS A STUB. The body is left as a sketch; we'll fill it in
 * after locking down the template-repo + Vercel auth. See:
 *   docs/github-per-client.md
 */

import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { setFact } from '@/lib/agent/facts'
import { FACT_KEYS } from '@/lib/agent/types'

const APNOSH_GH_ORG = 'Apnosh'
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

  const slug = (client.slug as string).toLowerCase().replace(/[^a-z0-9-]/g, '-')
  const repoName = slug

  // STUB: replace these with actual API calls once we lock down
  // GITHUB + VERCEL credentials.
  const githubPat = process.env.APNOSH_GITHUB_PAT
  const vercelToken = process.env.VERCEL_API_TOKEN
  if (!githubPat || !vercelToken) {
    return { success: false, error: 'GITHUB or VERCEL credentials missing in env' }
  }

  // 1. Create repo from template
  // POST https://api.github.com/repos/{template_owner}/{template_repo}/generate
  // body: { owner: APNOSH_GH_ORG, name: repoName, private: false, include_all_branches: false }
  // headers: Authorization: Bearer {githubPat}, Accept: application/vnd.github+json

  // 2. Optionally template apnosh-content.json with the client's slug + name
  // PUT /repos/{owner}/{repo}/contents/apnosh-content.json
  // body: { message: "Configure for {client.name}", content: base64(...), branch: "main" }

  // 3. Create Vercel project
  // POST https://api.vercel.com/v9/projects
  // body: { name: repoName, gitRepository: { type: 'github', repo: `${APNOSH_GH_ORG}/${repoName}` }, framework: 'eleventy' }
  // headers: Authorization: Bearer {vercelToken}

  // 4. Create deploy hook
  // POST https://api.vercel.com/v1/projects/{projectId}/deploy-hooks
  // body: { name: 'apnosh-portal', ref: 'main' }
  // → returns hookUrl

  // 5. Write back to portal DB
  const repoFullName = `${APNOSH_GH_ORG}/${repoName}`
  const repoHtmlUrl = `https://github.com/${repoFullName}`
  // const vercelDeploymentUrl = `https://${slug}.vercel.app`
  // const vercelProjectId = '<set from response>'
  // const deployHookUrl = '<set from response>'

  await admin.from('site_settings').upsert({
    client_id: clientId,
    site_type: 'external_repo',
    external_repo_url: repoHtmlUrl,
    // external_site_url: vercelDeploymentUrl,
    // external_deploy_hook_url: deployHookUrl,
  }, { onConflict: 'client_id' })

  await setFact({
    clientId,
    key: FACT_KEYS.CHANNEL_GITHUB_REPO,
    value: repoFullName,
    source: 'platform',
  })

  return {
    success: false,
    error: 'Stub: provisioning logic not yet implemented. See docs/github-per-client.md.',
  }
}
