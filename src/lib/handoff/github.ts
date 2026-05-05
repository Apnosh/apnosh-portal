/**
 * GitHub helpers for the designer handoff pipeline. Uses the REST API
 * directly (no octokit dep needed). Authenticated via APNOSH_GITHUB_TOKEN.
 */

const GITHUB_API = 'https://api.github.com'

function token() {
  const t = process.env.APNOSH_GITHUB_TOKEN
  if (!t) throw new Error('APNOSH_GITHUB_TOKEN is not set')
  return t
}

function org() {
  const o = process.env.APNOSH_GITHUB_ORG
  if (!o) throw new Error('APNOSH_GITHUB_ORG is not set (e.g. "apnosh-sites")')
  return o
}

function headers() {
  return {
    'Authorization': `Bearer ${token()}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'apnosh-portal',
  }
}

export interface RepoInfo {
  fullName: string
  htmlUrl: string
  defaultBranch: string
  alreadyExisted: boolean
}

/** Create a private repo in the apnosh org, or return the existing one. */
export async function createOrFetchRepo(name: string, description: string): Promise<RepoInfo> {
  const o = org()
  // Try to fetch first
  const fetchRes = await fetch(`${GITHUB_API}/repos/${o}/${name}`, { headers: headers() })
  if (fetchRes.ok) {
    const j = await fetchRes.json() as { full_name: string; html_url: string; default_branch: string }
    return { fullName: j.full_name, htmlUrl: j.html_url, defaultBranch: j.default_branch, alreadyExisted: true }
  }
  // Create
  const createRes = await fetch(`${GITHUB_API}/orgs/${o}/repos`, {
    method: 'POST',
    headers: { ...headers(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      description,
      private: true,
      auto_init: true,                 // gives us a main branch + initial README
      has_issues: true,
      has_projects: false,
      has_wiki: false,
    }),
  })
  if (!createRes.ok) {
    throw new Error(`GitHub repo create failed: ${createRes.status} ${await createRes.text()}`)
  }
  const j = await createRes.json() as { full_name: string; html_url: string; default_branch: string }
  return { fullName: j.full_name, htmlUrl: j.html_url, defaultBranch: j.default_branch, alreadyExisted: false }
}

/** Create or update a file at `path` in the repo. */
export async function putFile(opts: {
  repoFullName: string
  path: string
  content: string
  message: string
  branch: string
}): Promise<{ sha: string; commitSha: string }> {
  const url = `${GITHUB_API}/repos/${opts.repoFullName}/contents/${encodeURIComponent(opts.path)}`
  // If file exists, we need its sha to update
  let existingSha: string | undefined
  const head = await fetch(`${url}?ref=${encodeURIComponent(opts.branch)}`, { headers: headers() })
  if (head.ok) {
    const h = await head.json() as { sha?: string }
    existingSha = h.sha
  }
  const res = await fetch(url, {
    method: 'PUT',
    headers: { ...headers(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: opts.message,
      content: Buffer.from(opts.content, 'utf-8').toString('base64'),
      branch: opts.branch,
      ...(existingSha ? { sha: existingSha } : {}),
    }),
  })
  if (!res.ok) {
    throw new Error(`GitHub putFile failed (${opts.path}): ${res.status} ${await res.text()}`)
  }
  const j = await res.json() as { content: { sha: string }; commit: { sha: string } }
  return { sha: j.content.sha, commitSha: j.commit.sha }
}

/** Read a file's content + sha. Returns null if not found. */
export async function getFile(opts: {
  repoFullName: string
  path: string
  branch: string
}): Promise<{ content: string; sha: string } | null> {
  const url = `${GITHUB_API}/repos/${opts.repoFullName}/contents/${encodeURIComponent(opts.path)}?ref=${encodeURIComponent(opts.branch)}`
  const res = await fetch(url, { headers: headers() })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`GitHub getFile failed: ${res.status} ${await res.text()}`)
  const j = await res.json() as { content: string; sha: string; encoding: string }
  if (j.encoding !== 'base64') throw new Error(`Unexpected encoding ${j.encoding}`)
  return {
    content: Buffer.from(j.content, 'base64').toString('utf-8'),
    sha: j.sha,
  }
}

/** Get the latest commit on a branch. */
export async function getLatestCommit(repoFullName: string, branch: string): Promise<{ sha: string; author: string; message: string; date: string } | null> {
  const url = `${GITHUB_API}/repos/${repoFullName}/commits?sha=${encodeURIComponent(branch)}&per_page=1`
  const res = await fetch(url, { headers: headers() })
  if (!res.ok) return null
  const j = await res.json() as Array<{
    sha: string
    commit: { message: string; author: { name: string; date: string } }
    author?: { login?: string } | null
  }>
  if (!j.length) return null
  const c = j[0]
  return {
    sha: c.sha,
    author: c.author?.login || c.commit.author.name,
    message: c.commit.message,
    date: c.commit.author.date,
  }
}

/** Add a GitHub user as a push-permission collaborator. */
export async function addCollaborator(opts: {
  repoFullName: string
  username: string
  permission?: 'pull' | 'push' | 'admin' | 'maintain' | 'triage'
}): Promise<void> {
  const url = `${GITHUB_API}/repos/${opts.repoFullName}/collaborators/${encodeURIComponent(opts.username)}`
  const res = await fetch(url, {
    method: 'PUT',
    headers: { ...headers(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ permission: opts.permission ?? 'push' }),
  })
  // 201 = invitation created, 204 = already a collaborator (org member). Both fine.
  if (!res.ok && res.status !== 204) {
    throw new Error(`GitHub addCollaborator failed: ${res.status} ${await res.text()}`)
  }
}
