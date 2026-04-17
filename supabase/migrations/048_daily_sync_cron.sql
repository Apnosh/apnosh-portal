-- ============================================================================
-- 048: daily auto-sync of GA4 and GSC metrics via pg_cron
-- ============================================================================
-- Enables pg_cron + pg_net extensions and schedules daily invocations of the
-- sync-ga4-metrics and sync-gsc-metrics Edge Functions. Without this, the
-- analytics dashboard would slowly go stale after the initial backfill.
--
-- Schedule: staggered at 02:07 and 02:17 UTC to avoid thundering herd on
-- Google APIs. Off-minute picks (7 and 17) avoid the common 00 alignment.
--
-- NOTE: this migration was applied directly via the Supabase Management API
-- because it references env vars (SUPABASE_URL, SERVICE_ROLE_KEY) that are
-- only available at apply time. The real cron jobs live in cron.job and are
-- visible via `SELECT jobname, schedule FROM cron.job`.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Actual cron.schedule calls are issued out-of-band with the service role key
-- and the project URL. See docs/runbooks/cron-setup.md for the exact SQL.

COMMENT ON EXTENSION pg_cron IS 'Schedules periodic jobs. Used for daily analytics sync.';
COMMENT ON EXTENSION pg_net IS 'Async HTTP from Postgres. Used by cron jobs to invoke Edge Functions.';
