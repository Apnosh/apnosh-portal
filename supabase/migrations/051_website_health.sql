-- ============================================================================
-- 051: website_health table (current snapshot per client)
-- ============================================================================
-- Holds a single row per client with the most recent health snapshot:
-- uptime status, PageSpeed scores, SSL validity, and the Last-Modified
-- header from the last check. Written by the sync-site-health Edge Function
-- daily; read by /dashboard/website/health.
--
-- Note: migration 014 declared this table originally but was never applied
-- in production. This migration is the actual deployed definition.
-- ============================================================================

CREATE TABLE IF NOT EXISTS website_health (
  client_id uuid PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,

  uptime_status text NOT NULL DEFAULT 'unknown'
    CHECK (uptime_status IN ('up', 'down', 'degraded', 'unknown')),
  uptime_pct_30d numeric(5, 2),

  pagespeed_mobile integer
    CHECK (pagespeed_mobile IS NULL OR (pagespeed_mobile >= 0 AND pagespeed_mobile <= 100)),
  pagespeed_desktop integer
    CHECK (pagespeed_desktop IS NULL OR (pagespeed_desktop >= 0 AND pagespeed_desktop <= 100)),

  ssl_valid boolean,
  ssl_expires_at timestamptz,

  last_content_update_at timestamptz,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE website_health ENABLE ROW LEVEL SECURITY;

CREATE POLICY "website_health_client_select" ON website_health
  FOR SELECT TO authenticated
  USING (
    client_id = current_client_id()
    OR client_id = current_user_client_id()
  );

CREATE POLICY "website_health_admin_all" ON website_health
  FOR ALL TO authenticated
  USING (is_admin());

COMMENT ON TABLE website_health IS
  'Current site-health snapshot per client. Written by sync-site-health Edge Function.';
