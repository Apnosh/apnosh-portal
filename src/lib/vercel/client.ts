/**
 * Thin Vercel REST API wrapper.
 *
 * Uses VERCEL_API_TOKEN (a personal/team token with project create scope).
 * Optionally VERCEL_TEAM_ID when our projects live under a team rather
 * than a personal account; pass it on every request as a ?teamId= param.
 */

const VERCEL_API = 'https://api.vercel.com'

function token(): string {
  const t = process.env.VERCEL_API_TOKEN
  if (!t) throw new Error('VERCEL_API_TOKEN not set in env')
  return t
}

function teamQuery(): string {
  const teamId = process.env.VERCEL_TEAM_ID
  return teamId ? `?teamId=${encodeURIComponent(teamId)}` : ''
}

async function vercelFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const sep = path.includes('?') ? '&' : '?'
  const teamId = process.env.VERCEL_TEAM_ID
  const fullPath = teamId ? `${path}${sep}teamId=${encodeURIComponent(teamId)}` : path
  return fetch(`${VERCEL_API}${fullPath}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token()}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  })
}

export interface VercelProject {
  id: string
  name: string
  framework: string | null
  link: { repo: string; type: string } | null
}

/**
 * Create a new Vercel project linked to a GitHub repo. The repo must
 * already exist under the Apnosh GitHub org and the Vercel-GitHub
 * integration must have access to it (handled once at org setup).
 *
 * Auto-deploys are enabled on push to default branch.
 */
export async function createProject(args: {
  name: string                  // matches GitHub repo name; becomes {name}.vercel.app
  githubRepo: string            // "Apnosh/yellow-bee"
  framework?: string            // "eleventy" | "nextjs" | null (auto-detected by Vercel)
}): Promise<VercelProject> {
  const res = await vercelFetch(`/v10/projects`, {
    method: 'POST',
    body: JSON.stringify({
      name: args.name,
      framework: args.framework ?? null,
      gitRepository: {
        type: 'github',
        repo: args.githubRepo,
      },
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Vercel createProject failed (${res.status}): ${text}`)
  }
  return await res.json() as VercelProject
}

export interface VercelDeployHook {
  id: string
  name: string
  url: string
  ref: string
}

/**
 * Create a deploy hook for a project. The hook URL can be POSTed to
 * by the portal whenever DB-backed content changes, triggering a
 * rebuild of the site without needing a git commit.
 */
export async function createDeployHook(args: {
  projectId: string
  name: string                  // e.g. "apnosh-portal"
  ref?: string                  // default "main"
}): Promise<VercelDeployHook> {
  const res = await vercelFetch(`/v1/projects/${args.projectId}/deploy-hooks`, {
    method: 'POST',
    body: JSON.stringify({
      name: args.name,
      ref: args.ref ?? 'main',
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Vercel createDeployHook failed (${res.status}): ${text}`)
  }
  return await res.json() as VercelDeployHook
}

/**
 * Get the production URL Vercel assigns to a project. Useful for
 * writing back to site_settings.external_site_url after creation.
 * The default is `{project_name}.vercel.app` until a custom domain
 * is attached.
 */
export function defaultVercelUrl(projectName: string): string {
  return `https://${projectName}.vercel.app`
}

export { teamQuery }
