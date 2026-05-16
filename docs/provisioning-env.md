# Provisioning environment variables

Required for the GitHub-per-client provisioning flow
(`src/lib/admin/provision-client-site.ts`). Set in Vercel under the
apnosh-portal project's Environment Variables.

## `APNOSH_GITHUB_PAT`

A fine-grained PAT under the Apnosh GitHub org with these scopes:

- **Repository permissions**
  - Administration: Read and write (needed to create repos)
  - Contents: Read and write (needed to patch site.json + apnosh-content.json)
  - Metadata: Read

Or a classic PAT with `repo` + `workflow` scope. The currently active
local `gh auth` token (`gho_*`) has the right scopes already; use that
or generate a fresh one at:
https://github.com/settings/tokens?type=beta

Test it locally:
```bash
curl -H "Authorization: Bearer $APNOSH_GITHUB_PAT" https://api.github.com/orgs/Apnosh
```

## `VERCEL_API_TOKEN`

A personal access token with project creation scope.

Create at: https://vercel.com/account/tokens

Test:
```bash
curl -H "Authorization: Bearer $VERCEL_API_TOKEN" https://api.vercel.com/v2/user
```

## `VERCEL_TEAM_ID` (optional)

Required only if Apnosh's Vercel projects live under a team rather
than a personal account. If you see `?teamId=team_xxx` in your Vercel
dashboard URLs, you need this set to that value.

Test:
```bash
curl -H "Authorization: Bearer $VERCEL_API_TOKEN" \
  "https://api.vercel.com/v10/projects?teamId=$VERCEL_TEAM_ID&limit=1"
```

## After setting these

1. Trigger a redeploy of apnosh-portal so the new env vars take effect
2. Go to `/admin/clients/[any-slug]/site`
3. Scroll to "Hosting & deploys" card
4. Click "Provision site"
5. Wait ~20-30s
6. See the repo URL, live URL, and "Deploy hook: Connected" status

Failures surface as red error boxes in the card. Most common:

- `APNOSH_GITHUB_PAT not set in env` → set it, redeploy
- `GitHub generate-from-template failed (422)` → repo name collision; the slug already has a repo. Pick a different slug or delete the existing repo.
- `Vercel createProject failed (403)` → token doesn't have project-create scope; regenerate with the right scope
- `Vercel createProject failed (404)` → the GitHub repo wasn't fully ready when Vercel tried to link it. Re-run; the second attempt usually succeeds.
