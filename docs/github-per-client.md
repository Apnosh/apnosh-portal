# GitHub-per-client architecture

Every Apnosh client website lives in its own GitHub repo under the
`Apnosh` org. The portal (and eventually the AI agent) operates on
those repos via the GitHub API and a per-client Vercel project.

## Why this shape

1. **Safe rails for the AI agent.** Every change is a git commit; nothing
   touches the live site without going through a commit (and optionally
   a PR). Bounded surface area, full audit trail, trivial rollback.
2. **Per-client isolation.** A client's site doesn't share code or
   deploys with anyone else. One client's bug never affects another.
3. **Real ownership transfer.** If a client churns, we hand them the
   repo. They keep what we built.
4. **Multi-environment.** Branches map to environments: `main` →
   production, `staging` → preview, `agent/*` → AI-generated PRs.
5. **Strategist-grade tooling.** Strategists can clone the repo, edit
   locally, push, and Vercel deploys. No portal required for advanced
   edits.

## Naming + conventions

- Repo name: `Apnosh/{client_slug}` (e.g. `Apnosh/yellow-bee`)
- Default branch: `main`
- Required files at repo root:
  - `apnosh-content.json` — declares editable fields (already documented)
  - `vercel.json` — Vercel config
  - `package.json` — build scripts
- Required headers in every page:
  - GA4 tag (managed via `apnosh-content.json` -> `analytics.ga4_id`)
  - Clarity tag (same)
- Auto-deployed to: `https://{slug}.vercel.app` (Vercel preview)
- Custom domain attached via Vercel API; verified via the GBP/website
  setup wizard

## The template repo

`Apnosh/site-template` is the starter every new client repo forks from.
It includes:

- Eleventy 3.x setup (matches yellow-bee)
- Standard `apnosh-content.json` skeleton (vertical-aware: restaurant,
  café, food-truck, etc.)
- GA4 + Clarity snippet stubs that pull IDs from `apnosh-content.json`
- Pre-baked pages: Home, Menu, About, Locations, Contact
- Tailwind + Apnosh design tokens (so all sites share a visual baseline
  unless customized)
- GitHub Actions workflow: lint + content validation on every PR
- Pull-request template that auto-tags `@apnosh/strategists` for review

## Provisioning flow

When a new client is created in the portal:

1. **Strategist clicks "Provision site"** (or onboarding wizard does
   it automatically on signup)
2. `provisionClientSite(clientId)` runs:
   - Fetches the client's slug
   - Calls GitHub API: `POST /repos/Apnosh/site-template/generate`
     with new name `Apnosh/{slug}`
   - Templates `apnosh-content.json` with the client's basics
     (name, brand color if known, etc.)
   - Calls Vercel API: create project pointing at the new repo
   - Sets Vercel env vars (GA_ID, CLARITY_ID, etc. when ready)
   - Adds the deploy hook URL to `site_settings.external_deploy_hook_url`
   - Sets the webhook URL for build notifications back to the portal
3. Inserts/updates the `site_settings` row:
   - `site_type = 'external_repo'`
   - `external_repo_url`, `external_site_url`, `external_deploy_hook_url`
4. Writes a fact: `channels.github.repo = Apnosh/{slug}`

After provisioning, the client has:
- A working website at `{slug}.vercel.app`
- A GitHub repo Apnosh owns
- Auto-deploys on push to main
- The portal already knows about all of it

## How the AI agent uses the repo

Three patterns:

### Pattern 1: DB-only changes (fast, instant)
For changes captured in `client_content_fields` (copy + photos
overrides), the agent updates the DB and the site reads the override
on next build. Triggers a Vercel deploy hook to rebuild within ~30s.

This covers ~80% of routine changes: hours, prices, copy tweaks,
photo swaps.

### Pattern 2: Direct commits to main (medium)
For schema-defined changes that aren't field overrides (e.g. adding
a new menu category section, adjusting layout via a feature flag),
the agent makes a small commit directly to main.

Reserved for changes that:
- Are mechanical (no design judgment)
- Are covered by `apnosh-content.json` constraints
- Have a unit test that passes

### Pattern 3: Pull request (slow, reviewed)
For anything else (new pages, redesigns, structural copy changes,
photo galleries), the agent opens a PR on a branch like
`agent/2026-05-add-summer-menu`. The PR description includes:

- Plain-English summary of what changed
- Diff highlights
- Owner-facing preview link (Vercel preview URL)
- Tag the strategist for review

Strategist reviews + merges. Owner sees the change live within seconds.

## Operational concerns

### Secrets
- GitHub PAT: env var `APNOSH_GITHUB_PAT` (org admin scope)
- Vercel token: env var `VERCEL_API_TOKEN`
- Per-repo deploy hooks: stored in `site_settings.external_deploy_hook_url`
- Custom domains: stored in `site_settings.custom_domain`

### Rate limits
- GitHub: 5,000 req/hour authenticated. Plenty for our scale.
- Vercel: project-create is rate-limited to a few per minute. Batch new
  signups, don't burst.

### Bad states
- Repo created but Vercel project failed → store partial state in
  `site_settings`, surface in admin, retry-able
- Build fails → Vercel webhook flags it in `client_updates`, strategist
  sees in their queue
- Custom domain not verified → already handled by existing site
  manager UI

## What I'm NOT building yet

- Automated repo deletion (high-risk; manual for now)
- Multi-region Vercel deploys
- A/B testing different page versions
- Branch protection rules (will add once we have actual production
  traffic)
- Renaming repos (GitHub supports it; not worth automating yet)

## Files in this codebase

```
src/lib/admin/provision-client-site.ts
  ↳ The server action that creates a repo + Vercel project for a client.

src/app/admin/clients/[clientId]/provision-button.tsx
  ↳ Admin UI: "Provision site" button on the client detail page.

src/app/api/webhooks/vercel/deploy/route.ts
  ↳ Receives Vercel deploy completion webhooks; updates the portal.

src/lib/github/client.ts
  ↳ Thin wrapper around the GitHub REST API with org credentials.

src/lib/vercel/client.ts
  ↳ Thin wrapper around Vercel REST API.
```

(These files exist as stubs to be filled in as we build out the
provisioning flow.)
