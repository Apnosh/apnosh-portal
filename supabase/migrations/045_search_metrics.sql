-- ============================================
-- search_metrics — Google Search Console daily data
-- Migration: 045_search_metrics
-- ============================================
-- Stores per-client, per-site, per-day aggregates from GSC.
-- Top queries and top pages stored as jsonb for flexibility.

CREATE TABLE IF NOT EXISTS search_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  site_url text NOT NULL,
  date date NOT NULL,

  -- Aggregates for the day
  total_impressions integer DEFAULT 0,
  total_clicks integer DEFAULT 0,
  avg_ctr numeric,
  avg_position numeric,

  -- Top query breakdowns -- [{query, impressions, clicks, ctr, position}]
  top_queries jsonb,
  top_pages jsonb,
  raw_data jsonb,

  created_at timestamptz DEFAULT now(),

  UNIQUE(client_id, site_url, date)
);

CREATE INDEX IF NOT EXISTS idx_search_metrics_client_date ON search_metrics(client_id, date);

-- RLS
ALTER TABLE search_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "search_metrics_client_select" ON search_metrics
  FOR SELECT TO authenticated
  USING (
    client_id = current_client_id()
    OR client_id = current_user_client_id()
  );

CREATE POLICY "search_metrics_admin_all" ON search_metrics
  FOR ALL TO authenticated
  USING (is_admin());
