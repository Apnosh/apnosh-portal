# Apnosh Integration Playbook

The single source of truth for connecting any client site to Apnosh.

## The principle

**Apnosh is a data layer, not a UI layer.**

Each customer site has its own design language. Apnosh provides canonical
data through one public API. Each site composes that data into its existing
UI elements rather than accepting injected components.

This is the Stripe.js pattern, not the WordPress widget pattern. Stripe.js
gives you primitives that fit any design; WordPress widgets break themes.

When you onboard a new client, you are NOT trying to make Apnosh look the
same on their site. You are trying to make their site stay 100% theirs
while feeding it fresh data automatically.

---

## What Apnosh provides

Per client, the public API at
`https://portal.apnosh.com/api/public/sites/<slug>` returns:

```ts
{
  client:       { id, name, slug, website }
  brand:        { primary_color, secondary_color, fonts, logo_url, voice_notes }
  location:     { name, address, hours, special_hours }
  hours:        { mon: [...], tue: [...], ... }   // weekly ranges
  specialHours: [ { date, closed, ranges, reason }, ... ]
  activePromo:  { name, description, discount_type, valid_from, valid_until, code, terms } | null
  upcomingEvents: [ { name, description, start_at, end_at, ... } ]
  social:       { instagram: 'https://...', facebook: '...', tiktok: '...' }
  heroPhotoUrl: string | null
  meta:         { siteType, generatedAt }
}
```

This is the entire surface. Build everything else on the customer side.

---

## Integration pattern (per framework)

### Eleventy / static (e.g. Yellow Bee)

1. Add `src/_data/apnosh.js` that fetches at build time.
2. Reference data in templates: `apnosh.activePromo`, `apnosh.hours`, etc.
3. Wire the deploy hook so portal updates trigger a rebuild.
4. **Compose data into existing template components — don't add Apnosh-specific markup.**

### Next.js (App Router)

1. Add `lib/apnosh.ts` with `getApnoshData()` using `fetch()` with `next: { revalidate: 60 }`.
2. Server components call `getApnoshData()` and render through their own UI.
3. Wire the deploy hook to force-rebuild on portal updates.
4. ISR keeps data fresh between deploys.

### Astro / SvelteKit / other

Same pattern: a build-time fetcher, the customer site's own components consume it.

---

## The integration checklist (per client)

When onboarding a new external_repo client, walk through this list.

### 1. Identify the data hooks in their existing design

For each Apnosh data type, find the existing UI element on their site that
matches:

| Apnosh data | Find their existing... |
|---|---|
| `activePromo` | Hero CTA, banner, ticker, "current deals" section |
| `hours` | Hours block on contact / locations page |
| `specialHours` / closures | Holiday hours notice, alert banner |
| `upcomingEvents` | Events page, "what's on" section |
| `social` | Footer social links |
| `heroPhotoUrl` | Hero background image |
| `brand.primary_color` etc. | CSS custom properties / theme tokens |

### 2. Audit: do you have everything you need?

If a site doesn't have a place for active promos, that's a design
conversation, not an Apnosh problem. Don't create one. Either:
- Their design genuinely doesn't need promos surfaced (skip it)
- Their design is missing a primitive that should exist (add it as a
  proper section, not as an Apnosh-specific widget)

### 3. Wire the data feed

Add the apnosh fetcher (`_data/apnosh.js` or `lib/apnosh.ts`).

### 4. Compose data into existing components

For each item from #1, replace hardcoded content (or add) so it pulls from
`apnosh.*`.

### 5. Configure on portal side

In `/admin/clients/<slug>/site`:
- Set `site_type = 'external_repo'`
- Paste the live site URL
- Paste the Vercel deploy hook URL
- Generate API key (optional)
- Mark "Site is live"

### 6. Test the round-trip

Use the **Test (dry)** button in the portal. All 4 rows should pass:
- Settings: configured
- External site: 200 OK
- Public API: 200 OK
- Deploy hook: skipped (dry run)

Then publish a real test promo and watch:
- Recent updates shows it as `published`
- Vercel project gets a deploy "via Deploy Hook"
- After ~30s the new content appears on the live site

---

## Anti-patterns (do not do these)

### ❌ Don't inject Apnosh-branded UI

If you find yourself adding a `apnosh-promo-banner` or `apnosh-hours-widget`
component to the customer's site, stop. The customer's design already has
the right place for that data; find it and feed it.

### ❌ Don't make Apnosh-specific CSS classes part of the customer's design

Class names should describe what they are in the customer's vocabulary
(`hero-deal`, `top-bar-item`), not where the data came from
(`apnosh-promo`, `apnosh-banner`).

### ❌ Don't hardcode integration details into the public API

Every customer should be able to use the same `/api/public/sites/<slug>`
shape. Don't add per-customer fields. If a customer needs something custom,
that's their integration code, not the API.

### ❌ Don't bypass the public API by reading the database directly from the customer site

The public API is the contract. Reading `client_updates` directly couples
the customer's site to internal schema and breaks when we refactor.

### ❌ Don't fight the customer's existing layout

If a banner conflicts with a fixed nav, don't add z-index hacks or modify
the customer's nav. Move the data into a different existing element (their
ticker, hero, etc.). The customer's layout wins.

---

## How we keep this consistent at scale

This playbook only matters if it gets followed. Three mechanisms keep that
true:

### 1. Documentation here
This file is the source of truth. When patterns change, update it. When
onboarding a new team member, hand them this first.

### 2. Code review with an integration lens
When merging customer site PRs, the reviewer asks:
- Does this introduce Apnosh-specific UI? (red flag)
- Does this fight the customer's layout? (red flag)
- Does this duplicate what already exists in the customer's design? (red flag)

### 3. Per-client onboarding artifact
Each client integration produces a short doc (kept in their site repo):
- Which existing UI elements consume which Apnosh data
- Where the deploy hook lives
- Where env vars live (APNOSH_SLUG, optional APNOSH_API_KEY)
- One smoke-test URL or command

This way the next person to touch the integration knows the contract.

---

## When to break the pattern

If a client:
- Pays for the `apnosh_custom` tier (we hand-build the site)
- Or pays for `apnosh_generated` (we generate it from their context)

…then Apnosh DOES own the UI for that site. The integration playbook above
applies to `external_repo` clients only — sites we don't own.

For `apnosh_custom` and `apnosh_generated`, the principle still holds in
spirit (data + design are separate concerns), but the implementation lives
in the Apnosh portal codebase, not in a customer repo.

---

## The schema contract: `apnosh-content.json`

Every customer site publishes one schema file at `/apnosh-content.json`.
This file is the single source of truth for what the dashboard exposes to
the client. **The customer site declares; the dashboard renders.**

### Minimum shape

```json
{
  "version": 1,
  "vertical": "restaurant",
  "displayName": "Yellow Bee",
  "features": ["menu", "specials", "copy", "photos"],
  "fields": []
}
```

| Key | Required | What it does |
|---|---|---|
| `version` | yes | Bump when the format changes incompatibly. |
| `vertical` | no | Free-form string (`restaurant`, `salon`, `gym`, `cafe`). Used for analytics + scaffolding. |
| `displayName` | no | Override for `client.name` in the dashboard header. |
| `features` | no | Which dashboard tiles to expose. Defaults to all when omitted. |
| `fields` | yes | Array of editable copy/asset/toggle fields. Empty array is valid. |

### `features` — the dashboard render contract

The dashboard's manage-site hub looks at this list to decide which tiles
to render. A salon's schema might say `["copy", "photos"]` and never see
the Menu or Specials tiles. A restaurant says `["menu", "specials", "copy", "photos"]`.

Currently recognized features (extend in `src/lib/dashboard/content-actions.ts → DashboardFeature`):

- `menu` — restaurant-style menu (uses `menu_items` table)
- `specials` — recurring daily specials (uses `client_specials` table)
- `copy` — text + toggle fields from `fields[]`
- `photos` — asset fields from `fields[]`

When a feature isn't in the list, its tile is hidden AND visiting its URL
directly shows a "feature not enabled" page (graceful, not 404).

### How to add a new feature type

1. Add a case to `DashboardFeature` in `content-actions.ts`.
2. Build the editor component + sub-page under `dashboard/website/manage/<feature>`.
3. Add a tile to the manage-site hub.
4. Document the new feature here.
5. Customer sites that need it add the string to their `features` array.

The tile + sub-page show automatically for sites that opt in. Sites that
don't declare the feature see no change. Backwards-compatible by design.

### Why the customer site owns the schema

Two reasons:

1. **It versions with the customer's design.** A schema change is a deploy
   to the customer site, same as any other content change. No drift between
   what the dashboard offers and what the customer site renders.
2. **It scales without portal code per client.** New site, new schema file,
   the dashboard adapts automatically. The portal stays generic.
