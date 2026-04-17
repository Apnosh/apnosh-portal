-- ============================================================================
-- 049: weekly_briefs table for the Weekly Heartbeat touchpoint
-- ============================================================================
-- Each row is a single client's weekly summary. Generated every Monday
-- covering the previous week (Mon-Sun). Starts as 'draft', becomes
-- 'published' when an AM approves or after 48h auto-approve safety window.
-- ============================================================================

CREATE TABLE IF NOT EXISTS weekly_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  -- Week boundaries (Mon-Sun, local time intended)
  week_starting date NOT NULL,
  week_ending date NOT NULL,

  -- Core website metrics (summed from daily rows where summable;
  -- unique_visitors is the authoritative weekly total from GA4 directly)
  unique_visitors integer,
  visitor_trend_pct numeric,
  sessions integer,
  sessions_trend_pct numeric,
  page_views integer,
  bounce_rate numeric,
  avg_session_duration integer,

  -- Search performance
  search_impressions integer,
  search_clicks integer,
  search_trend_pct numeric,
  top_search_query text,

  -- Conversions
  conversion_total integer,
  conversion_trend_pct numeric,

  -- AI-style narrative fields (template for now, Claude-generated later)
  headline text,                  -- "Your visitors doubled this week"
  narrative text,                 -- 1-2 paragraph summary
  highlights jsonb,               -- [{ label, value, insight }]
  top_sources text[],             -- up to 3 source labels

  -- Forward-looking
  next_week_preview text,

  -- Delivery + engagement
  status text DEFAULT 'draft',    -- draft | published | viewed
  generated_at timestamptz DEFAULT now(),
  published_at timestamptz,
  viewed_at timestamptz,
  view_count integer DEFAULT 0,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE(client_id, week_starting)
);

CREATE INDEX IF NOT EXISTS idx_weekly_briefs_client
  ON weekly_briefs(client_id, week_starting DESC);
CREATE INDEX IF NOT EXISTS idx_weekly_briefs_status
  ON weekly_briefs(status, generated_at DESC);

ALTER TABLE weekly_briefs ENABLE ROW LEVEL SECURITY;

-- Clients read their own briefs (only published ones)
CREATE POLICY "weekly_briefs_client_select" ON weekly_briefs
  FOR SELECT TO authenticated
  USING (
    (client_id = current_client_id() OR client_id = current_user_client_id())
    AND status IN ('published', 'viewed')
  );

-- Admins have full access
CREATE POLICY "weekly_briefs_admin_all" ON weekly_briefs
  FOR ALL TO authenticated
  USING (is_admin());

COMMENT ON TABLE weekly_briefs IS
  'One row per client per week. Generated Monday, covers prior Mon-Sun.';
