-- ─────────────────────────────────────────────────────────────
-- 164_gbp_places_reviews.sql
--
-- Reviews stopgap via the Google Places API.
--
-- The legacy Google My Business API (v4) — the only Google API that
-- serves review *management* — is disabled for our project and Google
-- has it locked behind a manual grant we've requested. Until that lands,
-- the Places API (already enabled on the project) gives us a read-only
-- view: a place's overall star rating, total rating count, and up to ~5
-- recent reviews. Enough to show a real rating instead of "—".
--
-- We cache the place id + headline rating on gbp_locations (one row per
-- listing) and upsert the recent reviews into local_reviews.
-- ─────────────────────────────────────────────────────────────

alter table gbp_locations
  add column if not exists place_id           text,
  add column if not exists place_rating        numeric(2,1),
  add column if not exists place_rating_count  integer,
  add column if not exists places_synced_at    timestamptz;

comment on column gbp_locations.place_id is
  'Google Places API place id, resolved from name + address. Distinct from store_code (the GBP location id).';
comment on column gbp_locations.place_rating is
  'Overall Google star rating from the Places API (true average across all reviews).';
comment on column gbp_locations.place_rating_count is
  'Total number of Google ratings from the Places API.';
comment on column gbp_locations.places_synced_at is
  'When the Places rating/reviews were last refreshed.';
