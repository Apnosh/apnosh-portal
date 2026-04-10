-- ============================================================
-- 021 — Extend platform_connections for Instagram integration
-- ------------------------------------------------------------
-- Adds client_id (alongside existing business_id) and
-- Instagram-specific fields needed by the Graph API.
-- ============================================================

ALTER TABLE platform_connections
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES clients(id) ON DELETE CASCADE;

ALTER TABLE platform_connections
  ADD COLUMN IF NOT EXISTS ig_account_id text;

ALTER TABLE platform_connections
  ADD COLUMN IF NOT EXISTS page_id text;

ALTER TABLE platform_connections
  ADD COLUMN IF NOT EXISTS page_name text;

CREATE INDEX IF NOT EXISTS idx_platform_connections_client
  ON platform_connections(client_id, platform);

-- Allow admin to manage all connections
DROP POLICY IF EXISTS "Admins manage platform_connections" ON platform_connections;
CREATE POLICY "Admins manage platform_connections" ON platform_connections
  FOR ALL USING (is_admin());

-- Client can read their own connections
DROP POLICY IF EXISTS "Client reads own connections" ON platform_connections;
CREATE POLICY "Client reads own connections" ON platform_connections
  FOR SELECT USING (client_id = current_client_id());
