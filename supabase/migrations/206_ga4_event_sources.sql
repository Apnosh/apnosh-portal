-- 206: GA4 event sources for the outcome funnel (Phase 1.5).
-- ============================================================================
-- Wires two new, real GA4 event sources into the daily website_metrics feed:
--   * menu_views   -> menu-page views (GA4 auto-collected page_view)
--   * order_clicks -> outbound clicks to the client's ordering site
--                     (GA4 Enhanced Measurement auto-collected 'click')
--
-- Both need an EXACT per-client config (owner decision: NO auto-detect). The
-- config lives in a small client-keyed table, client_analytics_config, to
-- match the rest of this world (website_metrics, channel_connections, and the
-- admin picker are all keyed by client_id, not by businesses.owner_id).
--
-- ga4_phone_taps is intentionally NOT added: GA4 cannot auto-track tel: taps
-- without a site tag, so that source stays AVAILABLE_NOT_CONNECTED in the
-- registry with an honest note. No column is minted for a number we can't
-- source honestly.
--
-- This migration is FILE ONLY. The owner applies it in the Supabase SQL editor
-- (local dev shares the production DB). The sync code degrades gracefully until
-- it is applied: if these columns are missing it catches 42703 / PGRST204 and
-- skips the two writes, never erroring the main GA4 sync.
-- ============================================================================

-- 1. Two new daily columns on website_metrics.
--    Nullable, NO default: a day we did not sync (or a client with no config)
--    stays honestly NULL, never a fake 0.
ALTER TABLE website_metrics
  ADD COLUMN IF NOT EXISTS menu_views   integer,
  ADD COLUMN IF NOT EXISTS order_clicks integer;

COMMENT ON COLUMN website_metrics.menu_views IS
  'GA4 menu-page views for the day (screenPageViews summed over the client''s configured menu path). NULL = not synced / no config; never defaulted to 0.';
COMMENT ON COLUMN website_metrics.order_clicks IS
  'GA4 outbound clicks to the client''s ordering site for the day (eventCount of click events whose linkDomain matches the configured ordering domain). NULL = not synced / no config; never defaulted to 0.';

-- 2. Per-client analytics config — the EXACT values the owner sets by hand.
--    One row per client. Absent row / null value = source stays not-connected.
CREATE TABLE IF NOT EXISTS client_analytics_config (
  client_id        uuid PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
  -- Exact menu page path, e.g. "/menu". Matched exact-or-prefix against GA4 pagePath.
  ga4_menu_path    text,
  -- Exact outbound ordering domain, e.g. "order.toasttab.com". Matched against GA4 linkDomain.
  ga4_order_domain text,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  updated_by       uuid
);

ALTER TABLE client_analytics_config ENABLE ROW LEVEL SECURITY;

-- Admin-only surface: the owner sets these on the internal insights board.
-- Clients never read/write this table directly (the sync uses the service role).
CREATE POLICY "client_analytics_config_admin_all" ON client_analytics_config
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- Let a client read its own config row (harmless, honest, future-proof).
CREATE POLICY "client_analytics_config_client_select" ON client_analytics_config
  FOR SELECT TO authenticated
  USING (
    client_id = current_client_id()
    OR client_id = current_user_client_id()
  );

notify pgrst, 'reload schema';
