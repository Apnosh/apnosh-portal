-- ============================================================
-- Dashboard Metrics Tables
-- Supports the v4 Robinhood-style marketing dashboard
-- ============================================================

-- 1. social_metrics: Daily cached social platform data
CREATE TABLE IF NOT EXISTS social_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('instagram', 'facebook', 'tiktok', 'linkedin', 'youtube')),
  metric_date date NOT NULL,
  reach integer NOT NULL DEFAULT 0,
  impressions integer NOT NULL DEFAULT 0,
  profile_visits integer NOT NULL DEFAULT 0,
  followers_gained integer NOT NULL DEFAULT 0,
  engagement_actions integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(business_id, platform, metric_date)
);

CREATE INDEX IF NOT EXISTS idx_social_metrics_biz_date
  ON social_metrics (business_id, metric_date DESC);

-- 2. gbp_metrics: Daily cached Google Business Profile data
CREATE TABLE IF NOT EXISTS gbp_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  location_id text,
  metric_date date NOT NULL,
  directions integer NOT NULL DEFAULT 0,
  calls integer NOT NULL DEFAULT 0,
  website_clicks integer NOT NULL DEFAULT 0,
  search_views integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(business_id, metric_date)
);

CREATE INDEX IF NOT EXISTS idx_gbp_metrics_biz_date
  ON gbp_metrics (business_id, metric_date DESC);

-- 3. benchmarks: Area averages per metric type
CREATE TABLE IF NOT EXISTS benchmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_type text NOT NULL CHECK (metric_type IN ('visibility', 'foot_traffic')),
  area text NOT NULL,
  avg_value integer NOT NULL DEFAULT 0,
  max_value integer NOT NULL DEFAULT 0,
  percentile_thresholds jsonb DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(metric_type, area)
);

-- 4. insights: AI-generated insight cards per client
CREATE TABLE IF NOT EXISTS insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  icon text NOT NULL DEFAULT 'star' CHECK (icon IN ('star', 'clock', 'map')),
  title text NOT NULL,
  subtitle text NOT NULL,
  view_type text NOT NULL CHECK (view_type IN ('visibility', 'foot_traffic')),
  generated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_insights_biz_view
  ON insights (business_id, view_type);

-- 5. am_notes: Account manager notes per client
CREATE TABLE IF NOT EXISTS am_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  am_user_id uuid,
  am_name text NOT NULL,
  am_initials text NOT NULL DEFAULT 'AP',
  note_text text NOT NULL,
  view_type text NOT NULL CHECK (view_type IN ('visibility', 'foot_traffic')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_am_notes_biz
  ON am_notes (business_id, created_at DESC);

-- ============================================================
-- RLS Policies
-- ============================================================

ALTER TABLE social_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE gbp_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE benchmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE am_notes ENABLE ROW LEVEL SECURITY;

-- Clients read own data
CREATE POLICY "Clients read own social_metrics"
  ON social_metrics FOR SELECT
  USING (business_id IN (
    SELECT b.id FROM businesses b WHERE b.owner_id = auth.uid()
  ));

CREATE POLICY "Clients read own gbp_metrics"
  ON gbp_metrics FOR SELECT
  USING (business_id IN (
    SELECT b.id FROM businesses b WHERE b.owner_id = auth.uid()
  ));

CREATE POLICY "Anyone can read benchmarks"
  ON benchmarks FOR SELECT
  USING (true);

CREATE POLICY "Clients read own insights"
  ON insights FOR SELECT
  USING (business_id IN (
    SELECT b.id FROM businesses b WHERE b.owner_id = auth.uid()
  ));

CREATE POLICY "Clients read own am_notes"
  ON am_notes FOR SELECT
  USING (business_id IN (
    SELECT b.id FROM businesses b WHERE b.owner_id = auth.uid()
  ));

-- Admins full access (service role bypasses RLS, but add explicit policies)
CREATE POLICY "Admins manage social_metrics"
  ON social_metrics FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins manage gbp_metrics"
  ON gbp_metrics FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins manage benchmarks"
  ON benchmarks FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins manage insights"
  ON insights FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins manage am_notes"
  ON am_notes FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
