-- ============================================================================
-- 053: daily Yelp sync cron
-- ============================================================================
-- Schedules sync-yelp-metrics to run every day at 03:27 UTC (between the
-- site health sync at 03:33 and the other early-morning jobs). The function
-- fetches Yelp business details for every active yelp connection in
-- channel_connections and writes a daily snapshot to review_metrics.
--
-- Like earlier cron migrations, the actual cron.schedule() call is applied
-- via the Supabase Management API because it references SUPABASE_URL and
-- the service role key. See cron.job for the live definition.
-- ============================================================================

SELECT 1;
