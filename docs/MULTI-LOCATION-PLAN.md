# Multi-location: the technical plan

**Written 2026-08-13.** Replaces an earlier draft that was wrong in three of its four
load-bearing claims. The strategic half — the goal, the model, what success looks like — is
`MULTI-LOCATION-CONTEXT.md`; read that first if you want to check the *goal* before the code.

## How this was produced, and why the first draft was wrong

Ten agents read the repo in parallel — the migrations, every write path, every read path, the UI
surfaces, and the downstream consumers — and then four more were told to REFUTE the claims the
plan rested on. Three of the four fell:

| My claim | Verdict |
|---|---|
| `gbp_metrics` can already store one row per location per day | **HELD**, with two precisions about NULL-permissive uniques |
| No dashboard read filters by location | **REFUTED.** The location-aware readers exist and are correct; nothing passes them a location, and two are dead code |
| The nightly sync writes only one location | **REFUTED.** It fetches many; the gap is in DISCOVERY and two secondary writes |
| Onboarding never creates location rows | **REFUTED.** It does seed them, gated on extras existing |

The single most important correction is the one below. I had this backwards: I thought
multi-location was a future migration risk. It is a live bug.

---

# Multi-location (chain) support: integrated technical plan

**Repo read:** `/private/tmp/apnosh-ship` (same tree as `~/Documents/GitHub/apnosh-portal`). Every claim below is cited to a file and line I opened. Where the two upstream readers disagreed, I say which one was right and why.

---

## 0. The one thing that reframes everything

**Per-location rows are already being written. This is not a future migration risk, it is a live bug class.**

Three of the four GBP writers loop over `gbp_locations` and write one `gbp_metrics` row per location per day, today:

- `src/lib/gbp-client-sync.ts:257-286` — `for (const row of clientLocations ?? [])` then `for (const targetDate of targetDates)`, upsert `onConflict: 'client_id,location_id,date'` with `location_id: \`gbp_loc_${storeCode}\``
- `src/lib/gbp-agency.ts:220-237` — same shape, `location_id = loc.name.replace('locations/', 'gbp_loc_')`
- `src/app/api/cron/gbp-ingest/route.ts:262-263` — `onConflict: 'client_id,location_id,date'`
- `src/lib/gbp-backfill-actions.ts:441-476` — the outlier: writes `gbp_location_id: loc.id` **and** `location_id: code`, upserts `onConflict: 'gbp_location_id,date'`

So the question is not "what breaks when we turn multi-location on." It is "what is already wrong for the clients who have more than one assigned `gbp_locations` row, and what gets worse at chain scale." The code itself testifies that this has already bitten: `src/lib/dashboard/get-home-metrics.ts:271-273` says *"(Do Si = 2 locations × ~530 days = 1060 rows) ... the home dashboard then looks like it has 'no data after mid-May'."*

I could not query production, so I cannot tell you how many clients are affected right now. That count is the first thing to establish (Phase 0).

### A second live defect I found while verifying

The two writer families use **incompatible conflict keys and incompatible text values for the same location**:

| Writer | `location_id` text written | `gbp_location_id` | Conflict key |
|---|---|---|---|
| `gbp-client-sync.ts:272` / `gbp-agency.ts:227` / `cron/gbp-ingest:263` | `gbp_loc_<store_code>` | left NULL | `client_id,location_id,date` |
| `gbp-backfill-actions.ts:429,445,476` | `<store_code>` (bare, `const code = resolveStoreCode(r)`) | the real uuid | `gbp_location_id,date` |

Neither key can see the other's row. A location-day that gets both a CSV backfill and an API sync produces **two rows that both sum into every dashboard total**. Migration `069_gbp_locations.sql:70-72` documents the NULL-permissiveness as intentional, which is what makes this possible. This is a straight double-count of Google numbers, independent of chains.

---

## 1. What exists vs what is missing

### Exists and is correct

| Thing | Where | Note |
|---|---|---|
| `gbp_locations` as a real per-listing entity | `069_gbp_locations.sql:18-40`; profile fields accreted in `071:24-25`, `144:12-17`, `151:12`, `152:15`, `164:17-21` | This is the de-facto per-location record |
| One-primary-per-client enforcement on `gbp_locations` | `152_gbp_location_is_primary.sql:39-41` partial unique index | Only covers rows with non-NULL `client_id` |
| `gbp_metrics` per-location storage | both keys work: `026:61` and `069:74-76` | Verdict was right that `uq_gbp_metrics_location_date` is real and not superseded |
| Cross-location summing in the main analytics reader | `get-gbp-analytics.ts:230-232` comment + `dailyByDate` fold | Summing GBP across listings is legitimate: Google reports per listing and they are additive |
| Pagination past the PostgREST 1000-row cap | `get-home-metrics.ts:277-289`, `get-gbp-analytics.ts:164-176`, `get-local-seo-view.ts:67-91` | Exactly three files. See §3 |
| `client_updates` null-means-all-locations model | `071_updates_system.sql:36-38` | The one place the schema models the brand/location split correctly |
| Location selector UI, context, URL + localStorage persistence | `location-context.tsx:41-110`, `location-selector.tsx`, `dashboard/layout.tsx:78-93` | Built, and well built |

### Exists but is unreachable (this is the real gap)

The first reader claimed "NO dashboard read path filters by location." The adversarial verdict refuted that, correctly: location-aware readers do exist. But the verdict's own correction ("a wiring gap") understates it. I traced every one:

- **`getLocalSeoView` (`get-local-seo-view.ts:32`) has zero callers.** `grep -rn "getLocalSeoView" src/` returns only its own definition. Dead code.
- **`getLocationsScoreboard` (`get-locations-scoreboard.ts:29`) has zero callers.** Same. Dead code. There is no `/dashboard/locations` route at all (`find src/app -ipath "*location*"` returns only the API route, two onboarding steps, and the GBP connect picker).
- **`getGbpAnalytics` accepts `locationId` (`get-gbp-analytics.ts:104-136`) and all four callers pass nothing:** `insights-detail/route.ts:47` `getGbpAnalytics(clientId, range)`, `why-signals/route.ts:49` `(clientId, '30d')`, `analyst-payload.ts:127` `(clientId, range)`, `assemble-signals.ts:56` `(clientId, '30d')`.
- **The selector renders on essentially no owner-facing page.** `dashboard/layout.tsx:141` returns early for MVP routes: `if (isMvpRoute(pathname)) return <>{children}</>`. `MVP_EXACT` / `MVP_PREFIX` (`layout.tsx:99-118`) covers `/dashboard`, `/insights`, `/reviews`, `/campaigns`, `/google-profile`, `/listings`, `/measure`, `/business-info`. `HeaderLocationSelector` only mounts in the legacy back-header branch (`layout.tsx:154`).
- **Only two components consume the selection:** `website/site-manager.tsx:205` (update composer default) and `review-themes-panel.tsx:25`.
- **The listing API routes accept `?locationId=` (`api/dashboard/listing/route.ts:26`) and the only caller never sends it:** `admin/clients/[slug]/tabs/gbp-profile-tab.tsx:101` builds `const q = \`?clientId=${...}\`` and nothing else.

**Honest summary: the location dimension is roughly 70% built on the read side and roughly 0% connected.** That is a better position than "missing," but it is not "correct and just needs a param."

### Broken by construction

**Two location tables, no join.** `gbp_locations` (069) and `client_locations` (`043_crm_complete_schema.sql:113-152`). `client_locations.gbp_location_id` is plain `text`, not a FK. `reviews.location_id` → `client_locations` (`052:13`); `gbp_metrics.gbp_location_id` → `gbp_locations` (`069:62`). No migration joins them.

This is not abstract. `get-client-locations.ts:30-63` returns rows from `client_locations` **or**, when that is empty, falls back to `gbp_locations` — so the `id` field means a different table depending on the client. Then `get-gbp-analytics.ts:129-136` and `get-local-seo-view.ts:45-52` resolve that id against `client_locations` only. **For any GBP-only client (the fallback path, which the code says is "many clients"), selecting a location resolves to `null`, the `.eq()` filter is skipped, and the page shows brand-wide totals labeled as one location.** Silent wrong answer, not an error.

**`client_locations` has no unique constraint of any kind** (`043:155` is a plain index; no `CREATE UNIQUE` for this table anywhere in 239 migrations) and **`is_primary DEFAULT true`** (`043:144`), the opposite of `gbp_locations` (`152:15` default false).

**Reviews: two tables, and the location-capable one is not where GBP reviews land.**
- `local_reviews` (`115_local_reviews.sql:18-52`) has **no location column**, and it is where Places reviews are written (`places-reviews.ts:153-157`).
- Worse, `places-reviews.ts:149-151` says it outright: *"Reviews are stored client-level, so pull them once from the primary (first) listing only."* The guard is `if (!primary && place.reviews.length)`. **For a chain, only the first-iterated location's reviews are ever ingested.** Every other location's reviews are invisible to the product.
- `reviews` (052) does have `location_id`, and `gbp-client-sync.ts:318-372` iterates `for (const loc of allLocations)` pulling per-location v4 reviews, then builds a payload (`:348-361`) with **no `location_id`**, discarding the attribution it just had in hand.
- `review_themes` (`128:5-7`) FKs to `client_locations`, matching `reviews`, not `local_reviews`.

**Brand-level lanes, correctly brand-level.** `social_metrics` `UNIQUE(client_id, platform, date)` (`026:35`), `social_posts` `UNIQUE(client_id, platform, external_id)` (`054:40`), `website_metrics` `UNIQUE(client_id, date)` (`043:468`), `client_analytics_config` PK = `client_id` (`206:38-45`), `campaigns` no location column at all (`166:18-35`; grep across 166/170/174/176/178/189/216/225 finds zero). The catalog already declares the website lane out of scope for chains: `187_catalog_services_seed.sql:6` `"Multi-location needs per-location pages with unique content"`. **This matches the agreed model and should be left alone.**

---

## 2. Phases, in dependency order

### Phase 0 — Measure the blast radius (no code)

Run against prod, in this order:

```sql
-- (a) how many clients are multi-location today
select client_id, count(*) from gbp_locations
where status = 'assigned' group by 1 having count(*) > 1;

-- (b) duplicate location-days across the two writer families
select client_id, date, count(*), count(distinct location_id), count(distinct gbp_location_id)
from gbp_metrics group by 1,2 having count(*) > count(distinct location_id);

-- (c) rows with no location key at all (unprotected by either unique)
select count(*) from gbp_metrics where gbp_location_id is null and location_id is null;

-- (d) duplicate primaries
select client_id, count(*) from client_locations where is_primary group by 1 having count(*) > 1;
```

**Done when:** you have four numbers. (a) tells you whether §3 is theory or live. (d) tells you whether the Phase 2 unique index will fail on existing data.

Do not skip this. Every later phase's risk rating depends on it.

### Phase 1 — Stop the double-count (schema, highest urgency, chain-independent)

Backfill `gbp_metrics.gbp_location_id` for every row by joining `location_id` to `gbp_locations.store_code`, handling **both** text shapes (`gbp_loc_<code>` and bare `<code>`). Then de-duplicate location-days, then:

```sql
alter table gbp_metrics alter column gbp_location_id set not null;
alter table gbp_metrics drop constraint gbp_metrics_client_id_location_id_date_key;
```

Repoint the three legacy writers (`gbp-client-sync.ts:284`, `gbp-agency.ts:237`, `cron/gbp-ingest/route.ts:263`) to `onConflict: 'gbp_location_id,date'` and set `gbp_location_id` in the payload.

New file: `supabase/migrations/240_gbp_metrics_location_required.sql`.

**Done when:** query (b) from Phase 0 returns zero rows, and re-running both a client sync and a CSV backfill for the same location-day leaves exactly one row.

**Ordering constraint:** the backfill must complete and be verified before `SET NOT NULL`, or the nightly sync starts erroring. Ship the backfill and the constraint as two separate dashboard-applied statements with a verification query between them (per the project's hand-the-SQL-to-the-owner workflow).

### Phase 2 — Pick one location table

`gbp_locations` is the canonical row. It is the one the GBP lane, the metrics FK, `client_updates`, and the profile fields all point at. Then:

1. `alter table client_locations alter column gbp_location_id type uuid using ...` plus a real FK to `gbp_locations(id)`.
2. `create unique index client_locations_one_primary_per_client on client_locations (client_id) where is_primary;`
3. Flip `is_primary` default from `true` to `false` to match `152:15`.
4. Fix `get-client-locations.ts:44-63` so the fallback path returns an object that carries **both** ids explicitly, and fix the two resolvers (`get-gbp-analytics.ts:129-136`, `get-local-seo-view.ts:45-52`) to accept either.

New file: `supabase/migrations/241_client_locations_reconcile.sql`.

**Done when:** for a GBP-only client, selecting a specific location in the selector changes the numbers on screen. Today it does not (see §1, the silent-null path). That single behavioral test proves the reconciliation landed.

**Blocked by:** Phase 0 query (d). If duplicate primaries exist, the unique index creation fails; dedupe first.

### Phase 3 — Fix the reads that silently truncate

Extract the `fetchAll` pagination helper that already exists three times (`get-home-metrics.ts:277`, `get-gbp-analytics.ts:167`, `get-local-seo-view.ts:74`) into one shared module, and apply it to every unpaginated time-series read in §3's table.

**Done when:** seed a test client with 3 locations × 400 days of `gbp_metrics` (1200 rows), then confirm `/dashboard/analytics/advanced` and the home hero report the same 30-day totals as `getGbpAnalytics`. Today they will not.

### Phase 4 — Fix per-location review ingestion

Add `location_id uuid references gbp_locations(id)` to `local_reviews` (nullable, plus a partial index). Remove the `if (!primary && ...)` guard at `places-reviews.ts:151` so every listing's reviews are pulled, stamped with that listing's id. Set `location_id` in the `gbp-client-sync.ts:348-361` payload from the loop variable already in scope at `:318-320`.

**Done when:** for a 2-location client, `select location_id, count(*) from local_reviews where client_id = ...` returns two non-null groups, and the review count on the Reviews screen goes up.

**Note the drift hazard before touching `reviews`:** `013_priority_1_tables.sql:49-70` creates `reviews` **without** `location_id`, `052_reviews_with_location.sql:10` re-creates it **with** `location_id`, both `IF NOT EXISTS`. On a fresh in-order run, 013 wins and the column does not exist. `052:2-8` asserts 013 was never applied in prod. That assertion is unverified by me and is a real risk for any new environment.

### Phase 5 — Connect the selector

Render `HeaderLocationSelector` on MVP routes (`layout.tsx:141` early-return). Thread `selectedLocationId` into the four `getGbpAnalytics` call sites and the listing routes. Revive or delete `getLocalSeoView` and `getLocationsScoreboard`.

**Done when:** switching location changes the numbers on `/dashboard`, `/dashboard/insights`, and `/dashboard/reviews`, and "All locations" returns to brand totals that equal the sum of the parts.

**Deliberately last.** Connecting the selector before Phases 1-4 makes wrong numbers *look* authoritative, which is worse than obviously-blended numbers.

---

## 3. Everything that breaks when per-location rows are written

This is the section that matters. I sorted by how wrong the owner-visible number gets.

### 3a. Silent truncation at the PostgREST 1000-row cap

Only three files paginate. Every read below issues one `.select()` with no `.range()`, gets capped at 1000 rows server-side, and because they all `.order('date', ascending: true)`, **the rows dropped are the most recent ones**. The dashboard shows a data cliff, not an error.

| File:line | Window | Rows at 1 loc | At 2 | At 3 | Reachable from |
|---|---|---|---|---|---|
| `get-advanced-metrics.ts:282-284` | `BOUND_DAYS = 800` (`:30`) | 800 | **1600 truncated** | **2400 truncated** | `/dashboard/analytics/advanced/page.tsx` |
| `get-dashboard-data.ts:254-258` | 365d (`:252`) | 365 | 730 | **1095 truncated** | no direct app caller found; verify before deleting |
| `get-local-seo-view.ts:98-108` (reviews queries, not the paginated GBP one) | 365d | varies | varies | varies | dead today |
| `get-home-sections.ts:148` | full history, no `gte` on the local_reviews line at `:152` | unbounded | unbounded | unbounded | live |
| `gbp-status.ts:71-75` | **all clients**, 180d, no client filter | huge | huger | huger | admin clients list |
| `insights/stage-values.ts:128-133` | caller-supplied | | | | live insights |
| `audit/index.ts:536` | `.limit(1)` — safe | | | | |

`get-advanced-metrics` is the sharpest one: at 800 days it is already over the cap for a 2-location client, meaning Do Si's advanced analytics page is showing truncated data today if that page is reachable for them.

`gbp-status.ts:71-75` selects `gbp_metrics` for **every client** with no `client_id` filter and no pagination. The 1000-row cap means most clients' freshness status is computed from no rows at all, which reads as "stale."

### 3b. Row count mistaken for day count

- **`gbp-apply/dispatch.ts:66-71`** — `baseline()` returns `days: rows.length` and the summary string `` `Baseline over the last ${rows.length} days` ``. For a 3-location client over a 30-day window this says **90 days**. This value is not just displayed; it is recorded as the baseline that lift reporting later compares against, so the error propagates into every "we improved X%" claim for that client.
- **`customer-eye-view.ts:96-99`** — `.order('date', desc).limit(30)` intending "last 30 days." At 3 locations this is **the last 10 days**. Feeds the AI's view of the business.
- **`get-home-sections.ts:257-266`** — the slow-night heuristic gates on `rows.length >= 14`, which at 3 locations passes with **5 days** of history. `dowN[day]++` counts rows, so `avgByDow` is a per-location average, not a per-day total. The weekday *ranking* survives if all locations have complete history; it skews as soon as one location has partial data. This drives the "Slow Tuesday expected" recommendation.

### 3c. "Latest row" becomes "an arbitrary location's row"

- **`audit/index.ts:534-539`** — `.order('date', desc).limit(1).maybeSingle()` reading `photo_count`. Returns whichever location happened to sort first on the newest date. The photo-coverage finding is then about one unnamed location, presented as the brand's.
- **`insights/stage-values.ts:485-492`** — `dayStamp` uses `.limit(1)`. For freshness this is acceptable (newest wins), but it will read fresh even when N-1 locations have not synced in weeks.
- **`connection-health.ts:130-136`**, **`integration-actions.ts:78-82`** — same "newest row wins" pattern. One healthy location masks N-1 broken ones. Not a wrong number, but a wrong *alert*, which is arguably worse.

### 3d. Sums that are correct for GBP and would be wrong if copied

`get-gbp-analytics.ts:230-232`, `outcome-tracker.ts:196-218`, `mcp/tools.ts:108-125`, `operator/context.ts:64-75`, `agent/context-loader.ts:329`, `agent/tools/weekly-recap.ts:55`, `campaigns/outcomes/window-lift.ts:48-49`, `stage-values.ts:128-145` all sum `gbp_metrics` rows without grouping. **For Google metrics this is correct** and should stay: two listings genuinely do get two sets of impressions.

The trap is the precedent. If anyone adds a location column to `social_metrics` or `website_metrics` and these same summing patterns are copied, the identical brand Instagram reach gets counted N times. `get-home-metrics.ts:293` and `:298` already `fetchAll` both tables and fold them into the same funnel as the GBP numbers.

### 3e. Attribution silently discarded

- **`places-reviews.ts:149-157`** — chain reviews are ingested from one listing only. Covered in §1.
- **`gbp-client-sync.ts:348-361`** — per-location review loop writes no `location_id`.
- **`get-gbp-analytics.ts:129-136` / `get-local-seo-view.ts:45-52`** — the wrong-table resolution that turns "filter to this location" into "show everything," silently.

---

## 4. Risks, and what should not be built

### Risks

**The Phase 1 backfill is the dangerous step.** It rewrites the key on the table every dashboard reads. `069_gbp_locations.sql:83-100` installs a `BEFORE INSERT OR UPDATE` trigger that overwrites `client_id` from `gbp_locations` whenever `gbp_location_id` is set. So the backfill will also **re-derive `client_id` on every row it touches**. If any `gbp_locations.client_id` is wrong or NULL (it is nullable, `069:20`), the backfill silently reassigns metrics to the wrong client or nulls them out. Verify `gbp_locations` client assignment is 100% correct before running the backfill, not after.

**`SET NOT NULL` before the backfill fully lands breaks the nightly sync.** Two statements, verification between.

**The 013/052 `reviews` drift** (`013:49-70` vs `052:2-10`) means a fresh environment may not have `reviews.location_id`. Any code that assumes it will work in prod and fail in a new staging DB. Confirm with `\d reviews` before writing anything that depends on it.

**De-duplicating before adding uniques will delete data.** For the `client_locations` primary index and the `gbp_metrics` location-day key, decide the survivor rule explicitly (newest `updated_at`? the row with a real `gbp_location_id`?) and snapshot the deleted rows to a side table first.

**Evidence I could not obtain:** whether migration 069 was actually applied in production. This project applies migrations by hand through the Supabase dashboard, so file order is not proof of database state. Everything in §1 about `gbp_location_id` existing is verified from migration files and from code that references the column, which is strong but not conclusive. Phase 0 query (c) settles it.

### Do not build

**Do not add a location column to `social_metrics`, `social_posts`, `website_metrics`, or `client_analytics_config`.** One Instagram account, one website, one brand. `026:35`, `054:40`, `043:468`, `206:38-45` are all correct as they stand. Adding location there creates the N-times-counted reach problem the agreed model exists to prevent, and it would have to fight `get-home-metrics.ts:293-298`, which folds all of these into one funnel.

**Do not add a location column to `campaigns`.** Zero location references across all eight campaign migrations. A brand-level campaign that happens to affect one location is a targeting parameter on a line item, not a new dimension on the campaign spine. Adding it now would ripple into the atom engine, the brain, work orders, and billing for no chain benefit that Phase 5 does not already deliver.

**Do not build per-location websites or per-location pages.** `187_catalog_services_seed.sql:6` already prices this as a separate build. Keep it sold that way.

**Do not build a "Locations" dashboard tab yet.** `get-locations-scoreboard.ts` is already written and already dead. Reviving it before Phases 1-3 gives every chain client a per-location scoreboard built on truncated and double-counted rows. Either delete it or leave it dark until Phase 3 passes.

**Do not connect the location selector first.** It is the most visible, cheapest-looking change, and it is the one that converts a visible problem ("these numbers look blended") into an invisible one ("these numbers are labeled Mountlake Terrace and are actually the whole brand"). It is Phase 5 for a reason.