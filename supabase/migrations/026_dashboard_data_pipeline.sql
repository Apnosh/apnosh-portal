-- ============================================================
-- Migration 026: Dashboard Data Pipeline
-- Drops the business_id-based tables from 025 and recreates
-- with client_id referencing clients(id), adds connection
-- tracking tables, and expands column set for full pipeline.
-- ============================================================

-- Drop old 025 tables (they reference businesses, not clients)
DROP TABLE IF EXISTS am_notes CASCADE;
DROP TABLE IF EXISTS insights CASCADE;
DROP TABLE IF EXISTS benchmarks CASCADE;
DROP TABLE IF EXISTS gbp_metrics CASCADE;
DROP TABLE IF EXISTS social_metrics CASCADE;

-- ============================================================
-- 1. social_metrics
-- Daily cached metrics per client per platform
-- ============================================================
CREATE TABLE social_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('instagram', 'facebook', 'tiktok', 'linkedin')),
  date date NOT NULL,
  reach integer DEFAULT 0,
  impressions integer DEFAULT 0,
  profile_visits integer DEFAULT 0,
  followers_total integer DEFAULT 0,
  followers_gained integer DEFAULT 0,
  engagement integer DEFAULT 0,
  posts_published integer DEFAULT 0,
  top_post_id text,
  top_post_reach integer DEFAULT 0,
  raw_data jsonb,
  created_at timestamptz DEFAULT now(),
  UNIQUE(client_id, platform, date)
);

CREATE INDEX idx_social_metrics_client_date ON social_metrics(client_id, date);
CREATE INDEX idx_social_metrics_lookup ON social_metrics(client_id, platform, date);

-- ============================================================
-- 2. gbp_metrics
-- Daily cached GBP performance data per client per location
-- ============================================================
CREATE TABLE gbp_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  location_id text,
  location_name text,
  date date NOT NULL,
  directions integer DEFAULT 0,
  calls integer DEFAULT 0,
  website_clicks integer DEFAULT 0,
  search_views integer DEFAULT 0,
  search_views_maps integer DEFAULT 0,
  search_views_search integer DEFAULT 0,
  photo_views integer DEFAULT 0,
  raw_data jsonb,
  created_at timestamptz DEFAULT now(),
  UNIQUE(client_id, location_id, date)
);

CREATE INDEX idx_gbp_metrics_client_date ON gbp_metrics(client_id, date);

-- ============================================================
-- 3. benchmarks
-- Area benchmark data per metric type
-- ============================================================
CREATE TABLE benchmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_type text NOT NULL CHECK (metric_type IN ('visibility', 'foot_traffic')),
  area_type text NOT NULL CHECK (area_type IN ('city', 'zip', 'national')),
  area_value text NOT NULL,
  business_type text,
  avg_value numeric NOT NULL,
  max_value numeric NOT NULL,
  percentile_25 numeric,
  percentile_50 numeric,
  percentile_75 numeric,
  sample_size integer,
  source text,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(metric_type, area_type, area_value, business_type)
);

-- ============================================================
-- 4. insights
-- Generated insight cards per client, refreshed daily
-- ============================================================
CREATE TABLE insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  view_type text NOT NULL CHECK (view_type IN ('visibility', 'foot_traffic')),
  icon text NOT NULL DEFAULT 'star' CHECK (icon IN ('star', 'clock', 'map', 'trending', 'alert')),
  title text NOT NULL,
  subtitle text NOT NULL,
  priority integer DEFAULT 0,
  active boolean DEFAULT true,
  generated_at timestamptz DEFAULT now(),
  expires_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_insights_client_view ON insights(client_id, view_type, active);

-- ============================================================
-- 5. am_notes
-- Account manager notes per client per view type
-- ============================================================
CREATE TABLE am_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  am_user_id uuid NOT NULL,
  am_name text NOT NULL,
  am_initials text NOT NULL,
  view_type text NOT NULL CHECK (view_type IN ('visibility', 'foot_traffic')),
  note_text text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_am_notes_client ON am_notes(client_id, view_type, created_at DESC);

-- ============================================================
-- 6. social_connections
-- OAuth tokens per client per social platform
-- ============================================================
CREATE TABLE social_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('instagram', 'facebook', 'tiktok', 'linkedin')),
  platform_account_id text NOT NULL,
  platform_account_name text,
  access_token text NOT NULL,
  refresh_token text,
  token_expires_at timestamptz,
  scopes text[],
  connected_by uuid,
  connected_at timestamptz DEFAULT now(),
  last_sync_at timestamptz,
  sync_status text DEFAULT 'pending' CHECK (sync_status IN ('pending', 'active', 'error', 'disconnected')),
  sync_error text,
  UNIQUE(client_id, platform, platform_account_id)
);

-- ============================================================
-- 7. gbp_connections
-- GBP connections per client (CSV import or future API)
-- ============================================================
CREATE TABLE gbp_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  location_id text NOT NULL,
  location_name text NOT NULL,
  address text,
  connection_type text NOT NULL DEFAULT 'csv_import' CHECK (connection_type IN ('csv_import', 'api')),
  access_token text,
  last_sync_at timestamptz,
  sync_status text DEFAULT 'pending',
  UNIQUE(client_id, location_id)
);

-- ============================================================
-- RLS Policies
-- ============================================================

ALTER TABLE social_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE gbp_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE benchmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE am_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE gbp_connections ENABLE ROW LEVEL SECURITY;

-- Client reads: resolve client_id via client_users or businesses.client_id
CREATE POLICY "Clients read own social_metrics" ON social_metrics FOR SELECT
  USING (client_id IN (
    SELECT cu.client_id FROM client_users cu WHERE cu.auth_user_id = auth.uid()
  ));

CREATE POLICY "Clients read own gbp_metrics" ON gbp_metrics FOR SELECT
  USING (client_id IN (
    SELECT cu.client_id FROM client_users cu WHERE cu.auth_user_id = auth.uid()
  ));

CREATE POLICY "Anyone can read benchmarks" ON benchmarks FOR SELECT
  USING (true);

CREATE POLICY "Clients read own insights" ON insights FOR SELECT
  USING (client_id IN (
    SELECT cu.client_id FROM client_users cu WHERE cu.auth_user_id = auth.uid()
  ));

CREATE POLICY "Clients read own am_notes" ON am_notes FOR SELECT
  USING (client_id IN (
    SELECT cu.client_id FROM client_users cu WHERE cu.auth_user_id = auth.uid()
  ));

-- social_connections: clients can read own BUT never see tokens
CREATE POLICY "Clients read own social_connections" ON social_connections FOR SELECT
  USING (client_id IN (
    SELECT cu.client_id FROM client_users cu WHERE cu.auth_user_id = auth.uid()
  ));

CREATE POLICY "Clients read own gbp_connections" ON gbp_connections FOR SELECT
  USING (client_id IN (
    SELECT cu.client_id FROM client_users cu WHERE cu.auth_user_id = auth.uid()
  ));

-- Admin full access on all tables
CREATE POLICY "Admins manage social_metrics" ON social_metrics FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin')));
CREATE POLICY "Admins manage gbp_metrics" ON gbp_metrics FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin')));
CREATE POLICY "Admins manage benchmarks" ON benchmarks FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin')));
CREATE POLICY "Admins manage insights" ON insights FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin')));
CREATE POLICY "Admins manage am_notes" ON am_notes FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin')));
CREATE POLICY "Admins manage social_connections" ON social_connections FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin')));
CREATE POLICY "Admins manage gbp_connections" ON gbp_connections FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin')));
