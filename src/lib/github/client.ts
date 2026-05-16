/**
 * Thin GitHub REST API wrapper.
 *
 * Uses APNOSH_GITHUB_PAT (a fine-grained PAT under the Apnosh org).
 * We don't pull in @octokit/rest to keep the bundle small; fetch is
 * enough for the handful of endpoints we need (generate from template,
 * update file, open PR).
 */

const GH_API = 'https://api.github.com'
const ORG = 'Apnosh'

function token(): string {
  const t = process.env.APNOSH_GITHUB_PAT
  if (!t) throw new Error('APNOSH_GITHUB_PAT not set in env')
  return t
}

async function ghFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${GH_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token()}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  })
  return res
}

export interface GhRepo {
  id: number
  name: string
  full_name: string
  html_url: string
  default_branch: string
}

/**
 * Generate a new repo under Apnosh org from a template repo. The
 * template must have is_template=true. Returns the new repo's basic
 * metadata.
 *
 * Caller is responsible for handling 422 (name conflict) by suggesting
 * a different slug.
 */
export async function generateRepoFromTemplate(args: {
  templateRepo: string                 // e.g. "Apnosh/site-template"
  newName: string                      // e.g. "yellow-bee" (no org prefix)
  description?: string
  private?: boolean
}): Promise<GhRepo> {
  const [templateOwner, templateName] = args.templateRepo.split('/')
  if (!templateOwner || !templateName) {
    throw new Error(`Invalid templateRepo "${args.templateRepo}"; expected "owner/name"`)
  }

  const res = await ghFetch(`/repos/${templateOwner}/${templateName}/generate`, {
    method: 'POST',
    body: JSON.stringify({
      owner: ORG,
      name: args.newName,
      description: args.description ?? '',
      include_all_branches: false,
      private: args.private ?? false,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`GitHub generate-from-template failed (${res.status}): ${text}`)
  }
  return await res.json() as GhRepo
}

/**
 * Fetch a file's contents + SHA. Needed before updateFile so we can
 * pass the sha (GitHub requires it for updates).
 */
export async function getFile(args: {
  repo: string                          // "owner/name"
  path: string                          // file path in repo
  ref?: string                          // branch / commit, defaults to main
}): Promise<{ sha: string; contentBase64: string; contentUtf8: string } | null> {
  const refQuery = args.ref ? `?ref=${encodeURIComponent(args.ref)}` : ''
  const res = await ghFetch(`/repos/${args.repo}/contents/${args.path}${refQuery}`)
  if (res.status === 404) return null
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`GitHub getFile failed (${res.status}): ${text}`)
  }
  const data = await res.json() as { sha: string; content: string; encoding: string }
  const contentUtf8 = data.encoding === 'base64'
    ? Buffer.from(data.content, 'base64').toString('utf-8')
    : data.content
  return { sha: data.sha, contentBase64: data.content.replace(/\s/g, ''), contentUtf8 }
}

/**
 * Create or update a file in a repo. If `sha` is provided it's an
 * update; otherwise it's a create. The branch is left at default
 * (main) unless overridden.
 */
export async function putFile(args: {
  repo: string
  path: string
  contentUtf8: string
  message: string
  sha?: string
  branch?: string
  authorName?: string
  authorEmail?: string
}): Promise<void> {
  const body: Record<string, unknown> = {
    message: args.message,
    content: Buffer.from(args.contentUtf8, 'utf-8').toString('base64'),
  }
  if (args.sha) body.sha = args.sha
  if (args.branch) body.branch = args.branch
  if (args.authorName && args.authorEmail) {
    body.author = { name: args.authorName, email: args.authorEmail }
    body.committer = { name: args.authorName, email: args.authorEmail }
  }

  const res = await ghFetch(`/repos/${args.repo}/contents/${args.path}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`GitHub putFile failed (${res.status}): ${text}`)
  }
}

/** Convenience: read a file, mutate the parsed JSON, write it back. */
export async function patchJsonFile(args: {
  repo: string
  path: string
  message: string
  mutate: (obj: Record<string, unknown>) => Record<string, unknown>
  authorName?: string
  authorEmail?: string
}): Promise<void> {
  const existing = await getFile({ repo: args.repo, path: args.path })
  if (!existing) {
    throw new Error(`File ${args.path} not found in ${args.repo}`)
  }
  const parsed = JSON.parse(existing.contentUtf8) as Record<string, unknown>
  const next = args.mutate(parsed)
  await putFile({
    repo: args.repo,
    path: args.path,
    contentUtf8: JSON.stringify(next, null, 2) + '\n',
    message: args.message,
    sha: existing.sha,
    authorName: args.authorName,
    authorEmail: args.authorEmail,
  })
}

export { ORG as APNOSH_GH_ORG }
