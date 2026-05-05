/**
 * Vercel helpers for the designer handoff pipeline. Authenticated via
 * APNOSH_VERCEL_TOKEN. All ops scoped to APNOSH_VERCEL_TEAM_ID.
 *
 * One-time setup the user does in the Vercel dashboard:
 *   1. Install the Vercel GitHub app on the apnosh GitHub org
 *   2. Generate a personal access token at vercel.com/account/tokens
 *   3. Find the team id at vercel.com/teams/{slug}/settings
 */

const VERCEL_API = 'https://api.vercel.com'

function token() {
  const t = process.env.APNOSH_VERCEL_TOKEN
  if (!t) throw new Error('APNOSH_VERCEL_TOKEN is not set')
  return t
}

function teamId() {
  // Optional. Hobby/personal Vercel accounts don't have a team ID — API
  // calls operate on the user's personal scope when teamId is omitted.
  return process.env.APNOSH_VERCEL_TEAM_ID || null
}

function headers() {
  return {
    'Authorization': `Bearer ${token()}`,
    'User-Agent': 'apnosh-portal',
  }
}

/** Returns the teamId query param including leading "?" / "&", or empty string for personal accounts. */
function teamQuery(separator: '?' | '&' = '?') {
  const id = teamId()
  return id ? `${separator}teamId=${encodeURIComponent(id)}` : ''
}

export interface VercelProjectInfo {
  id: string
  name: string
  alreadyExisted: boolean
}

/**
 * Create a Vercel project linked to a GitHub repo, or return the existing
 * one if a project with that name already exists for this team.
 */
export async function createOrFetchProject(opts: {
  name: string                // url-safe slug
  repoFullName: string        // "org/repo"
  framework?: string | null
}): Promise<VercelProjectInfo> {
  // Try to fetch first
  const lookup = await fetch(
    `${VERCEL_API}/v9/projects/${encodeURIComponent(opts.name)}${teamQuery('?')}`,
    { headers: headers() },
  )
  if (lookup.ok) {
    const j = await lookup.json() as { id: string; name: string }
    return { id: j.id, name: j.name, alreadyExisted: true }
  }

  // Create
  const createRes = await fetch(`${VERCEL_API}/v11/projects${teamQuery('?')}`, {
    method: 'POST',
    headers: { ...headers(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: opts.name,
      framework: opts.framework ?? null,        // null => static / detect
      gitRepository: {
        type: 'github',
        repo: opts.repoFullName,
      },
    }),
  })
  if (!createRes.ok) {
    throw new Error(`Vercel project create failed: ${createRes.status} ${await createRes.text()}`)
  }
  const j = await createRes.json() as { id: string; name: string }
  return { id: j.id, name: j.name, alreadyExisted: false }
}

/**
 * Trigger a deployment from the GitHub repo's default branch. Returns
 * the deployment URL once Vercel has assigned one.
 */
export async function triggerDeployment(opts: {
  projectName: string
  repoFullName: string
  branch: string
  commitSha?: string
}): Promise<{ id: string; url: string; readyState: string }> {
  const res = await fetch(`${VERCEL_API}/v13/deployments${teamQuery('?')}`, {
    method: 'POST',
    headers: { ...headers(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: opts.projectName,
      gitSource: {
        type: 'github',
        repo: opts.repoFullName,
        ref: opts.branch,
        ...(opts.commitSha ? { sha: opts.commitSha } : {}),
      },
      target: 'production',
    }),
  })
  if (!res.ok) {
    throw new Error(`Vercel deployment trigger failed: ${res.status} ${await res.text()}`)
  }
  const j = await res.json() as { id: string; url: string; readyState: string }
  return { id: j.id, url: j.url.startsWith('http') ? j.url : `https://${j.url}`, readyState: j.readyState }
}

/** Fetch the most recent deployment for a project. */
export async function getLatestDeployment(projectId: string): Promise<{ url: string; readyState: string; createdAt: number } | null> {
  const res = await fetch(
    `${VERCEL_API}/v6/deployments?projectId=${encodeURIComponent(projectId)}&limit=1${teamQuery('&')}`,
    { headers: headers() },
  )
  if (!res.ok) return null
  const j = await res.json() as { deployments: Array<{ url: string; readyState: string; created: number }> }
  if (!j.deployments?.length) return null
  const d = j.deployments[0]
  return {
    url: d.url.startsWith('http') ? d.url : `https://${d.url}`,
    readyState: d.readyState,
    createdAt: d.created,
  }
}
