-- 256: the shelf move — the owner's own words as goals, and the shape of the business.
--
-- Two problems this fixes.
--
-- 1. THE GOAL COLLAPSE. Onboarding asks fourteen goal chips and then folds them into seven
--    slugs, six of them into 'be_known_for' (src/lib/goals/defaults.ts CHIP_TO_SLUG). An owner
--    who taps "Better photos of my food" and an owner who taps "Reach a younger crowd" end up
--    with the same goal row, so the store cannot show either of them their own shelf. The eight
--    rows below give every chip its own slug, one to one. The two original slugs no chip maps to
--    ('be_known_for', 'more_reservations') stay: the shape defaults and goal_playbooks use them.
--
-- 2. NO SHAPE. Nothing on the client says whether this is a truck, a delivery kitchen, two
--    shops, a caterer or a seasonal place, so every shelf is drawn for a storefront. Sam's
--    truck card, Ray's delivery-only shelf and Kenji's second shop all need it.
--
-- Tenancy: keyed on clients / businesses, no business_id columns added.
-- Applied by hand in the Supabase SQL editor. Every writer is best-effort until it runs.

-- ── 1. The eight new goals, so a chip keeps its own words ────────────────────────────────
-- client_goals.goal_slug is a foreign key into goals_catalog, so a slug must exist here
-- before onboarding can save it. owner_voice is the chip the owner actually tapped.
insert into goals_catalog(slug, display_name, owner_voice, rationale, primary_signal, primary_lever, sort_order) values
  ('local_awareness',
   'Be known nearby',
   'I want to build local awareness',
   'Drives sales by being the name people already know before they need somewhere to eat.',
   'branded_search_volume', 'gbp_listings_local_content', 90),
  ('promote_offering',
   'Promote one thing',
   'I want to promote a specific offering',
   'Drives sales by putting one dish, night or service in front of people instead of everything at once.',
   'gbp_card_taps', 'launch_content_google_post', 100),
  ('grow_social',
   'Grow social following',
   'I want to grow our social following',
   'Drives sales through an audience you can reach again for free.',
   'post_reach', 'reels_posts_profiles', 110),
  ('launch_something',
   'Launch something new',
   'I want to launch something new',
   'Drives sales by making an opening, a menu or a look land as an event instead of a quiet change.',
   'gbp_impressions', 'launch_campaign', 120),
  ('stay_top_of_mind',
   'Stay top of mind',
   'I want to stay top of mind',
   'Drives sales by being remembered between visits, which is cheaper than being found again.',
   'gbp_impressions', 'steady_posting_gbp_activity', 130),
  ('beat_nearby',
   'Win the block',
   'I want to compete with the businesses near me',
   'Drives sales by winning the comparison people make on the map before they choose.',
   'gbp_card_taps', 'gbp_listings_reviews', 140),
  ('better_photos',
   'Better photos of the food',
   'I want better photos of my food',
   'Drives sales because the picture is the menu now; a bad first photo costs the visit.',
   'delivered_files', 'photo_library_gbp_photos', 150),
  ('younger_crowd',
   'Reach a younger crowd',
   'I want to reach a younger crowd',
   'Drives sales by showing up where a younger crowd actually looks, which is video.',
   'post_reach', 'reels_social_profiles', 160)
on conflict (slug) do nothing;

-- ── 2. The shape of the business ─────────────────────────────────────────────────────────
-- Six shapes, because these are the six that change what the store may show:
--   storefront     a place people come to (what an unanswered shelf falls back to)
--   truck          the spot moves; Google's pin does not
--   delivery_only  no dining room, so directions and Reserve are wrong to sell
--   two_locations  each shop has its own numbers and its own listing
--   catering       the buyer is an office, not a walk-in
--   seasonal       the year has an on-season and an off-season
--
-- NO DEFAULT, on purpose. A default of 'storefront' would stamp every existing client as a
-- storefront, and then nothing could tell an owner who ANSWERED "a place people come to" from
-- the thousands who were never asked. Null is the honest state for "never asked"; the code
-- reads it as a storefront (getClientShelfShape), which is the same shelf without the false
-- record. The CHECK allows null for exactly that reason.
alter table clients add column if not exists shape text
  check (shape is null or shape in ('storefront','truck','delivery_only','two_locations','catering','seasonal'));

-- The same answer on the onboarding draft row, so a half-finished setup restores it. The
-- clients column above stays the one the product reads.
alter table businesses add column if not exists shape text
  check (shape is null or shape in ('storefront','truck','delivery_only','two_locations','catering','seasonal'));

comment on column clients.shape is 'How the business runs. Read by the Create shelf (chip-shelf overrides) and set at onboarding.';

-- Make PostgREST see the new columns without a redeploy.
notify pgrst, 'reload schema';
