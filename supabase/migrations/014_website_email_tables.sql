-- ============================================================
-- Website + Email tables
-- ============================================================
-- Supports the Website and Email & SMS sections of the client portal.

-- ── 1. website_health (current snapshot per client) ─────────
CREATE TABLE IF NOT EXISTS website_health (
  client_id uuid primary key references clients(id) on delete cascade,
  -- Uptime
  uptime_status text not null default 'up' check (uptime_status in ('up', 'down', 'degraded', 'unknown')),
  uptime_pct_30d numeric(5, 2),  -- e.g. 99.95
  -- PageSpeed (0-100)
  pagespeed_mobile integer check (pagespeed_mobile >= 0 and pagespeed_mobile <= 100),
  pagespeed_desktop integer check (pagespeed_desktop >= 0 and pagespeed_desktop <= 100),
  -- Security
  ssl_valid boolean,
  ssl_expires_at timestamptz,
  -- Content freshness
  last_content_update_at timestamptz,
  -- Notes from admin
  notes text,
  updated_at timestamptz not null default now()
);

DROP TRIGGER IF EXISTS website_health_updated_at ON website_health;
CREATE TRIGGER website_health_updated_at
  BEFORE UPDATE ON website_health
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 2. website_traffic (monthly) ─────────────────────────────
CREATE TABLE IF NOT EXISTS website_traffic (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  month integer not null check (month between 1 and 12),
  year integer not null check (year >= 2024),
  visitors integer not null default 0,
  pageviews integer not null default 0,
  sessions integer not null default 0,
  bounce_rate numeric(5, 2),  -- e.g. 42.50
  avg_session_seconds integer,
  -- Traffic sources (jsonb for flexibility)
  traffic_sources jsonb not null default '{}',  -- {direct: 1200, search: 3400, social: 800, referral: 200}
  -- Top pages [{path, title, pageviews}]
  top_pages jsonb not null default '[]',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(client_id, month, year)
);

CREATE INDEX IF NOT EXISTS idx_website_traffic_client_period
  ON website_traffic(client_id, year DESC, month DESC);

DROP TRIGGER IF EXISTS website_traffic_updated_at ON website_traffic;
CREATE TRIGGER website_traffic_updated_at
  BEFORE UPDATE ON website_traffic
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 3. email_campaigns ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_campaigns (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  -- Identity
  name text not null,
  subject text not null,
  preview_text text,
  -- Content
  preview_url text,  -- Link to web preview of the email
  preview_image_url text,  -- Screenshot of rendered email
  body_html text,  -- Optional full HTML
  -- Status workflow
  status text not null default 'draft' check (status in (
    'draft', 'in_review', 'approved', 'scheduled', 'sending', 'sent', 'cancelled'
  )),
  -- Scheduling
  scheduled_for timestamptz,
  sent_at timestamptz,
  -- Audience
  recipient_count integer not null default 0,
  segment_name text,
  -- Metrics (populated after send)
  opens integer not null default 0,
  clicks integer not null default 0,
  unsubscribes integer not null default 0,
  bounces integer not null default 0,
  revenue numeric(10, 2),  -- Optional attributed revenue
  -- Admin notes
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS idx_email_campaigns_client_status
  ON email_campaigns(client_id, status);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_client_sent
  ON email_campaigns(client_id, sent_at DESC);

DROP TRIGGER IF EXISTS email_campaigns_updated_at ON email_campaigns;
CREATE TRIGGER email_campaigns_updated_at
  BEFORE UPDATE ON email_campaigns
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 4. email_list_snapshot (monthly list stats) ──────────────
CREATE TABLE IF NOT EXISTS email_list_snapshot (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  month integer not null check (month between 1 and 12),
  year integer not null check (year >= 2024),
  total_subscribers integer not null default 0,
  active_subscribers integer not null default 0,
  new_subscribers integer not null default 0,  -- added this month
  unsubscribes integer not null default 0,
  -- Segments summary [{name, count}]
  segments jsonb not null default '[]',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(client_id, month, year)
);

CREATE INDEX IF NOT EXISTS idx_email_list_snapshot_client_period
  ON email_list_snapshot(client_id, year DESC, month DESC);

DROP TRIGGER IF EXISTS email_list_snapshot_updated_at ON email_list_snapshot;
CREATE TRIGGER email_list_snapshot_updated_at
  BEFORE UPDATE ON email_list_snapshot
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── RLS policies ─────────────────────────────────────────────
ALTER TABLE website_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_traffic ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_list_snapshot ENABLE ROW LEVEL SECURITY;

-- Admin full access
DO $$ BEGIN CREATE POLICY "Admins manage website_health" ON website_health FOR ALL USING (is_admin()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Admins manage website_traffic" ON website_traffic FOR ALL USING (is_admin()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Admins manage email_campaigns" ON email_campaigns FOR ALL USING (is_admin()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Admins manage email_list_snapshot" ON email_list_snapshot FOR ALL USING (is_admin()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Dashboard users read their own
DO $$ BEGIN
  CREATE POLICY "Dashboard user reads website_health" ON website_health FOR SELECT
    USING (client_id = current_user_client_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Dashboard user reads website_traffic" ON website_traffic FOR SELECT
    USING (client_id = current_user_client_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Dashboard user reads email_campaigns" ON email_campaigns FOR SELECT
    USING (client_id = current_user_client_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Dashboard user reads email_list_snapshot" ON email_list_snapshot FOR SELECT
    USING (client_id = current_user_client_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Client portal users (magic link) read their own
DO $$ BEGIN
  CREATE POLICY "Client reads website_health" ON website_health FOR SELECT
    USING (client_id = current_client_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Client reads website_traffic" ON website_traffic FOR SELECT
    USING (client_id = current_client_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Client reads email_campaigns" ON email_campaigns FOR SELECT
    USING (client_id = current_client_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Client reads email_list_snapshot" ON email_list_snapshot FOR SELECT
    USING (client_id = current_client_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Realtime
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE website_health; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE website_traffic; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE email_campaigns; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE email_list_snapshot; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
