-- ============================================================
-- Dashboard Seed Data
-- Realistic 90-day data for a test restaurant client
-- Run AFTER migration 026
-- ============================================================

-- Use a fixed UUID for the test client so we can reference it
-- Check if a test client exists first; if not, create one
INSERT INTO clients (id, name, slug, industry, location, email, services_active, tier, monthly_rate, billing_status)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'The Golden Spoon',
  'golden-spoon',
  'Restaurant',
  'Seattle, WA',
  'hello@goldenspoon.com',
  ARRAY['social', 'local_seo'],
  'Standard',
  549,
  'active'
)
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name;

-- ============================================================
-- 90 days of social_metrics (Instagram)
-- Realistic restaurant numbers, trending upward
-- ============================================================
INSERT INTO social_metrics (client_id, platform, date, reach, impressions, profile_visits, followers_total, followers_gained, engagement, posts_published)
SELECT
  '00000000-0000-0000-0000-000000000001',
  'instagram',
  d::date,
  -- reach: 200-800/day trending up, weekends +30%
  GREATEST(0, (200 + (row_number() OVER (ORDER BY d) * 5.5)::int
    + (random() * 150)::int
    + CASE WHEN EXTRACT(DOW FROM d) IN (0, 6) THEN 80 ELSE 0 END
  )::int),
  -- impressions: ~2x reach
  GREATEST(0, (500 + (row_number() OVER (ORDER BY d) * 10)::int
    + (random() * 300)::int
    + CASE WHEN EXTRACT(DOW FROM d) IN (0, 6) THEN 150 ELSE 0 END
  )::int),
  -- profile_visits: 20-80/day
  GREATEST(0, (20 + (row_number() OVER (ORDER BY d) * 0.5)::int
    + (random() * 30)::int
  )::int),
  -- followers_total: start 1200, grow daily
  1200 + (row_number() OVER (ORDER BY d) * 4)::int + (random() * 3)::int,
  -- followers_gained: 2-8/day
  GREATEST(1, (2 + (random() * 6))::int),
  -- engagement: 50-200/day
  GREATEST(0, (50 + (row_number() OVER (ORDER BY d) * 1.2)::int
    + (random() * 80)::int
  )::int),
  -- posts_published: 0-2/day
  CASE WHEN random() > 0.6 THEN 1 WHEN random() > 0.9 THEN 2 ELSE 0 END
FROM generate_series(
  CURRENT_DATE - INTERVAL '90 days',
  CURRENT_DATE - INTERVAL '1 day',
  INTERVAL '1 day'
) AS d
ON CONFLICT (client_id, platform, date) DO NOTHING;

-- ============================================================
-- 90 days of gbp_metrics (single location)
-- ============================================================
INSERT INTO gbp_metrics (client_id, location_id, location_name, date, directions, calls, website_clicks, search_views, search_views_maps, search_views_search)
SELECT
  '00000000-0000-0000-0000-000000000001',
  'loc_golden_spoon_01',
  'The Golden Spoon - Capitol Hill',
  d::date,
  -- directions: 3-12/day trending up
  GREATEST(1, (3 + (row_number() OVER (ORDER BY d) * 0.08)::int
    + (random() * 6)::int
    + CASE WHEN EXTRACT(DOW FROM d) IN (5, 6) THEN 3 ELSE 0 END
  )::int),
  -- calls: 1-5/day
  GREATEST(0, (1 + (row_number() OVER (ORDER BY d) * 0.03)::int
    + (random() * 3)::int
  )::int),
  -- website_clicks: 2-8/day
  GREATEST(0, (2 + (row_number() OVER (ORDER BY d) * 0.05)::int
    + (random() * 4)::int
  )::int),
  -- search_views: 50-150/day trending up
  GREATEST(10, (50 + (row_number() OVER (ORDER BY d) * 0.9)::int
    + (random() * 60)::int
  )::int),
  -- maps views: ~60% of search
  GREATEST(5, (30 + (row_number() OVER (ORDER BY d) * 0.5)::int
    + (random() * 35)::int
  )::int),
  -- search views: ~40% of total
  GREATEST(5, (20 + (row_number() OVER (ORDER BY d) * 0.4)::int
    + (random() * 25)::int
  )::int)
FROM generate_series(
  CURRENT_DATE - INTERVAL '90 days',
  CURRENT_DATE - INTERVAL '1 day',
  INTERVAL '1 day'
) AS d
ON CONFLICT (client_id, location_id, date) DO NOTHING;

-- ============================================================
-- Benchmarks
-- ============================================================
INSERT INTO benchmarks (metric_type, area_type, area_value, business_type, avg_value, max_value, percentile_25, percentile_50, percentile_75, sample_size, source)
VALUES
  ('visibility', 'city', 'Seattle', 'restaurant', 2800, 6200, 1200, 2800, 4500, 340, 'internal_q4_2024'),
  ('foot_traffic', 'city', 'Seattle', 'restaurant', 195, 520, 80, 195, 350, 340, 'internal_q4_2024')
ON CONFLICT (metric_type, area_type, area_value, business_type) DO NOTHING;

-- ============================================================
-- Insights (2 per view)
-- ============================================================
INSERT INTO insights (client_id, view_type, icon, title, subtitle, priority, active)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'visibility', 'star',
   'Your reel reached 2,100 people in Capitol Hill',
   'Video is reaching 3x more people than photos right now.',
   3, true),
  ('00000000-0000-0000-0000-000000000001', 'visibility', 'clock',
   'Tuesday lunch is your sweet spot',
   'Posts at 11am-1pm get 40% more engagement.',
   2, true),
  ('00000000-0000-0000-0000-000000000001', 'foot_traffic', 'map',
   'Directions up 28% this month',
   'Google Business posts are driving visits.',
   3, true),
  ('00000000-0000-0000-0000-000000000001', 'foot_traffic', 'clock',
   'Friday evenings are peak',
   'Dinner searchers are finding you.',
   2, true);

-- ============================================================
-- AM Notes (1 per view)
-- ============================================================
INSERT INTO am_notes (client_id, am_user_id, am_name, am_initials, view_type, note_text)
VALUES
  ('00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000099',
   'Jordan Lee', 'JL', 'visibility',
   'Great month — your tasting menu reel was the top performer across all our restaurant clients this week. We''re doubling down on video content for November. I''d recommend scheduling a 15-min photo session to build up your content library.'),
  ('00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000099',
   'Jordan Lee', 'JL', 'foot_traffic',
   'Your Google Business Profile is really picking up. The weekly posts we started last month are paying off — directions requests are at an all-time high. Let''s add some Q&A posts next to capture more search traffic.');

-- ============================================================
-- GBP Connection (for the test location)
-- ============================================================
INSERT INTO gbp_connections (client_id, location_id, location_name, address, connection_type, sync_status)
VALUES
  ('00000000-0000-0000-0000-000000000001',
   'loc_golden_spoon_01',
   'The Golden Spoon - Capitol Hill',
   '1234 Broadway E, Seattle, WA 98102',
   'csv_import',
   'active')
ON CONFLICT (client_id, location_id) DO NOTHING;
