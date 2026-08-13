# Multi-location: the plan

**Written 2026-08-13**, after the owner said they have chain clients ready to onboard.

---

## The finding that shapes everything

**Multi-location is already largely built at the data layer, and not at all in the owner's
view.** The tables were designed for it years ago and then nothing on screen ever used them.

Already there:

| Piece | State |
|---|---|
| `client_locations` | Exists. Reviews reference it. |
| `gbp_locations` | Exists — the Google listing registry, per location, with `client_id` + `store_code` |
| `gbp_metrics.gbp_location_id` | Exists, with `unique (gbp_location_id, date)` — daily rows PER LOCATION are already legal |
| `reviews.location_id` | Exists, indexed on `(client_id, location_id)` |
| `getClientLocations()` | Exists — already lists a client's locations |
| `getGbpAnalytics()` | Already resolves a location's `gbp_location_id` |
| `gbp-agency` / `gbp-bulk` / `gbp-actions` | Already loop over multiple locations |

Missing:

- **Every dashboard read sums by `client_id` with no location filter.** `stage-values.ts`,
  `get-home-metrics.ts` and `insights-detail` do not mention `gbp_location_id` at all. A chain's
  listings blend into one number with nothing saying so.
- **No location switcher** anywhere in the owner UI.
- **Onboarding captures locations into a draft** but does not create `client_locations` rows.
- **Nothing distinguishes brand-level from location-level** on screen.

So this is not a rebuild. It is finishing a job that was started.

---

## The model

The thing that decides the whole design: **channels do not share a grain.**

| Channel | Real-world grain | Where it lives |
|---|---|---|
| Instagram / TikTok / Facebook | ONE account for the brand | client |
| Website / GA4 | ONE site | client |
| Google Business Profile | ONE listing **per location** | location |
| Reviews | attached to a listing | location |

This is why "one portal account per location" is the wrong answer, and it is worth writing down
because it is counter-intuitive: splitting a three-location chain into three accounts makes all
three connect the *same* Instagram, so the same 10,000 reach is counted three times and each
location's dashboard claims brand-wide numbers as its own. The wrong answer would have produced
confidently wrong numbers — the exact failure this codebase spent a week removing.

Summing GBP across locations, by contrast, is *legitimate*: distinct listings, no overlap.
The maths only works in one direction, and that direction is one account with location as a
dimension on the Google half.

### The law this creates

> **A number shown under a location must belong to that location, or say who it belongs to.**

When someone is viewing "Alki", Google numbers are Alki's. Social must say **"Instagram — whole
brand"** rather than implying that reach belongs to one restaurant. Without that label we have
not fixed the blending, only moved it somewhere quieter.

---

## Phases

### P1 — Make the data per-location (no visible change)

1. **Onboarding writes real rows.** The confirm screen collects locations with a `place_id`
   each; completion should create a `client_locations` row per location and, where the
   `place_id` resolves, a `gbp_locations` row. Today the extras live only in a draft column.
2. **The GBP sync loops.** `gbp-api-sync` pulls the primary listing; it should walk every
   `gbp_locations` row for the client and write one `gbp_metrics` row per (location, date).
   The unique constraint already supports it.
3. **Backfill.** Existing single-location clients get one `client_locations` row and their
   history stamped with its id, so "all locations" and "the only location" agree.

**Done when:** a two-location client has two `gbp_metrics` rows per day and nothing on screen
has changed.

### P2 — Let the reads take a location

4. Thread an optional `locationId` through `loadStageValues`, `getDataFrontier`,
   `get-home-metrics` and `insights-detail`. Absent = every location (today's behaviour).
5. Reviews filter by `location_id` when scoped.
6. **Guard:** a per-location read must never silently fall back to client-wide. If a location
   has no rows, it shows zero *for that location*, not the brand's number.

**Done when:** the same API returns Alki's numbers with a location, the chain's without one, and
they sum correctly.

### P3 — The switcher, and the honesty label

7. A location control in the dashboard header, defaulting to **All locations**. One number by
   default; breakdown on demand.
8. Every brand-level card gains a `whole brand` marker when a single location is selected. This
   is the law above, made visible. It is not optional polish; without it P2 is a new way to
   mislead.
9. The funnel's Awareness stage, which mixes GBP (per location) with social (brand), needs an
   explicit rule when scoped. Recommended: show the location's GBP, show social as brand-level
   and labelled, and never add them into a single scoped total.

**Done when:** switching to a location changes the Google numbers, leaves social visibly
brand-level, and no total silently mixes the two.

### P4 — The chain view

10. An "All locations" comparison: each location as a row with its own Google numbers, so an
    owner can see which site is lagging. This is the thing a chain owner actually wants and
    cannot get anywhere else.
11. Per-location campaigns come later, and only if asked. Most chain marketing is brand-level
    with occasional per-site pushes; `campaigns.location_id` can be added when a real request
    arrives rather than speculatively.

---

## What breaks along the way

- **Anything reading `gbp_metrics` without a location filter starts seeing multiple rows per
  day.** Today a `sum()` is accidentally correct because there is one row. After P1 it stays
  correct for the client total, but any code doing `.single()` or assuming one row per date will
  break. That code must be found before P1 ships, not after.
- **The shared data frontier** picks the newest day any source has. With several listings syncing
  at different times, "newest" could come from one location while another lags. The frontier
  should stay client-wide, not per-location, or windows will differ between the switcher's
  states.
- **The nightly cron gets N times longer** for chains. Worth watching the 60s function ceiling.

---

## What I would NOT do

- Per-location social accounts. The grain is wrong and it double counts.
- Per-location menus or brand voice, until a client asks. Most chains run one of each.
- A parent "group" object over separate accounts. That is the other architecture, and mixing
  both is how you get two sources of truth for one restaurant.

---

## Order of work

P1 → P2 → P3 are strictly sequential; each is useless without the one before. P4 is optional and
sellable on its own.

The riskiest step is P1.2 (the sync loop), because it changes what is written every night for
every client, and a mistake there is the kind that shows up as a wrong number days later. It
should ship with the same treatment the social sync got: a diagnostic that says what it wrote,
per location, so silence is never the report.
