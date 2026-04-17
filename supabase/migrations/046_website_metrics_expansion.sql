-- ============================================================================
-- 046: expand website_metrics with actionable local-business fields
-- ============================================================================
-- Adds the GA4 dimensions that actually drive decisions for local businesses:
-- - conversion_events: event counts (phone_clicks, direction_clicks, form_submits,
--   booking_clicks, other, total) parsed from GA4's eventName dimension
-- - top_cities: [{ city, sessions }] top 10 cities by sessions
-- - landing_pages: [{ path, sessions }] top 10 entry points
-- - new_users / returning_users: audience growth split
-- - top_referrers: [{ source, sessions }] top 10 external sites sending traffic
--
-- All columns are nullable so existing rows keep working.
-- ============================================================================

ALTER TABLE website_metrics
  ADD COLUMN IF NOT EXISTS conversion_events jsonb,
  ADD COLUMN IF NOT EXISTS top_cities jsonb,
  ADD COLUMN IF NOT EXISTS landing_pages jsonb,
  ADD COLUMN IF NOT EXISTS new_users integer,
  ADD COLUMN IF NOT EXISTS returning_users integer,
  ADD COLUMN IF NOT EXISTS top_referrers jsonb;

COMMENT ON COLUMN website_metrics.conversion_events IS
  'Object: { phone_clicks, direction_clicks, form_submits, booking_clicks, other, total }';
COMMENT ON COLUMN website_metrics.top_cities IS
  'Array of { city: string, sessions: number } sorted by sessions desc, max 10';
COMMENT ON COLUMN website_metrics.landing_pages IS
  'Array of { path: string, sessions: number } sorted by sessions desc, max 10';
COMMENT ON COLUMN website_metrics.top_referrers IS
  'Array of { source: string, sessions: number } sorted by sessions desc, max 10. Filtered to medium = referral';
