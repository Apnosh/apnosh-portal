# Handoff — owner mobile home + Alerts redesign

Working context for continuing the `design/mvp-home` work in a fresh Claude Code
session (e.g. on another machine). Delete this file before merging the branch.

## Where things stand

- **Repo:** `apnosh-portal` — https://github.com/Apnosh/apnosh-portal.git
- **Branch:** `design/mvp-home`
- **Latest commit:** `b6a764c` (everything is pushed; local matched remote at handoff)
- **Live preview:** https://apnosh-portal-git-design-mvp-home-apnosh.vercel.app
  (Vercel auto-deploys every push to this branch.)
- **Stack:** Next 16, React 19, Tailwind v4, Supabase. Node 24.

## What we've been building

A redesign of the **owner mobile home** (`/dashboard`) and the **Alerts /
notifications page** (`/dashboard/inbox`) in the apnosh-mvp design language.
This is a phone-first experience; on wide screens it centers in a phone-width
column.

### Owner home — `src/components/mvp/mvp-home.tsx` (`MvpHome`)

Locked top structure (non-negotiable, do not reorder): **metric graph →
stackable suggestion cards → monthly recap**. Below that, in order:

1. **Coming up next** — what the team is actively working on / what ships next
   (the content pipeline). Always renders, with an empty state ("Nothing
   queued"). Data: `src/lib/dashboard/get-upcoming-work.ts`
   (`content_calendar_items`).
2. **Recent activity** — a visual timeline of what shipped/posted/highlights.
   Always renders, with an empty state. Data:
   `src/lib/dashboard/get-since-last-checked.ts`.
3. **Quick links** — 4 full-width links, each on its own line. One is "Update
   business info".

Recent passes: subtle **motion** (`MVP_ANIM_CSS`: press, breathe, ping —
all guarded by `prefers-reduced-motion`) and **faint green glows** (ambient top
glow on the root background, glowing chart bars, icon-tile + status-chip halos).

### Alerts / Notifications — `src/components/mvp/mvp-inbox.tsx` (`MvpInbox`)

A **real notifications feed**: full-width rows separated by a hairline (no card
tiles, no gaps), edge to edge. Rows are **uniform** — no inline action buttons
(Reply / Review / Reconnect removed) and no separate "Read more" line; bodies
clamp to two lines with a trailing "…" and the whole row taps through to the
detail (reviews → `/dashboard/reviews/[id]`). Unread = soft green wash across
the row + green dot/time. The **All** view is one continuous feed (urgent first,
no section headers).

## Key files

| Area | File |
|------|------|
| Owner home component | `src/components/mvp/mvp-home.tsx` |
| Alerts / notifications | `src/components/mvp/mvp-inbox.tsx` |
| App shell (bottom nav, header) | `src/components/mvp/mvp-shell.tsx` |
| Home page (wires data) | `src/app/dashboard/page.tsx` |
| Consolidated data endpoint | `src/app/api/dashboard/load/route.ts` |
| Home data transform | `src/components/mvp/home-transform.ts` |
| Coming up next data | `src/lib/dashboard/get-upcoming-work.ts` |
| Recent activity data | `src/lib/dashboard/get-since-last-checked.ts` |

## Design tokens (mvp `C`)

green `#4abd98`, greenDk `#2e9a78`, greenSoft `#eaf7f3`, ink `#1d1d1f`, mute
`#6e6e73`, faint `#aeaeb2`, line `#e6e6ea`, coral `#c0564f`, bg `#f5f5f7`.
Display font: `'Cal Sans','Inter',sans-serif`.

## Constraints (carry these forward)

- **No em dashes** in user-facing copy.
- Home is **helpful, not upsell** — no "start a campaign / add / upgrade" nudges
  in helpful content.
- Don't duplicate other surfaces: Campaigns = active work, Alerts =
  notifications, Insights = the numbers.
- Commits end with: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

## Verify + deploy loop

```bash
# typecheck + production build (empty Stripe key lets it build without the secret)
npx tsc --noEmit
STRIPE_SECRET_KEY='' npx next build

# deploy: commit, then push — Vercel builds automatically
git push origin design/mvp-home

# poll the Vercel status for a commit
sha=$(git rev-parse HEAD)
gh api repos/Apnosh/apnosh-portal/commits/$sha/statuses \
  --jq '[.[]|select(.context|test("[Vv]ercel"))][0].state'
```

Local dev server: `npm run dev` (Next dev on http://localhost:3000). The app is
auth-gated, so you sign in to reach `/dashboard`.

## Open / offered (not started)

- Alerts: optional **fixed minimum row height** for pixel-perfect uniformity
  (offered, not yet done).
- Home: a `SAMPLE_REVIEW` "$800" placeholder banner still sits above the cards
  (sample content during the build phase; remove when real monthly-review data
  exists).
- Parked: deeper insights / feed / editorial home concepts.

## To resume

In a fresh Claude Code session started in this repo, say:
> Read HANDOFF.md and continue the `design/mvp-home` work.
