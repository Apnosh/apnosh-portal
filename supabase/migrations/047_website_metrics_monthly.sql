-- ============================================================================
-- 047: monthly aggregate table for "unique entity" metrics
-- ============================================================================
-- Metrics like activeUsers / newUsers / returningUsers cannot be correctly
-- summed across daily rows because GA4 counts each distinct user once per day
-- regardless of repeat visits. Summing inflates the number by the cross-day
-- return rate.
--
-- This table stores a separately-computed monthly aggregate per client per
-- calendar month, updated by sync-ga4-metrics each time it runs.
--
-- The UI reads session-based metrics (sessions, pageviews, bounce rate) from
-- the daily website_metrics table and reads user-count metrics from here.
-- ============================================================================

CREATE TABLE IF NOT EXISTS website_metrics_monthly (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  year integer NOT NULL,
  month integer NOT NULL,         -- 1-12
  unique_visitors integer,         -- GA4 activeUsers for the calendar month
  unique_new_users integer,        -- GA4 newUsers for the calendar month
  unique_returning_users integer,  -- GA4 activeUsers filtered to newVsReturning = returning
  last_synced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE (client_id, year, month)
);

CREATE INDEX IF NOT EXISTS idx_website_metrics_monthly_client
  ON website_metrics_monthly(client_id, year DESC, month DESC);

ALTER TABLE website_metrics_monthly ENABLE ROW LEVEL SECURITY;

-- Clients can read their own
CREATE POLICY "website_metrics_monthly_client_select" ON website_metrics_monthly
  FOR SELECT TO authenticated
  USING (
    client_id = current_client_id()
    OR client_id = current_user_client_id()
  );

-- Admins can read all
CREATE POLICY "website_metrics_monthly_admin_all" ON website_metrics_monthly
  FOR ALL TO authenticated
  USING (is_admin());

COMMENT ON TABLE website_metrics_monthly IS
  'Per-calendar-month GA4 unique-user aggregates. Separate from daily website_metrics because GA4 unique counts cannot be summed across days.';
