-- ============================================================
-- Migration 028: Content Engine Bridge
-- Connects Content Engine (admin) to Content Queue (client)
-- ============================================================

-- Add link from content_calendar_items to content_queue
ALTER TABLE content_calendar_items
  ADD COLUMN IF NOT EXISTS content_queue_id uuid REFERENCES content_queue(id);

CREATE INDEX IF NOT EXISTS idx_calendar_items_queue
  ON content_calendar_items(content_queue_id);

-- Add link from content_queue back to content_calendar_items
ALTER TABLE content_queue
  ADD COLUMN IF NOT EXISTS calendar_item_id uuid REFERENCES content_calendar_items(id);

-- Add caption/hashtags to content_queue if not already there
ALTER TABLE content_queue
  ADD COLUMN IF NOT EXISTS caption text,
  ADD COLUMN IF NOT EXISTS hashtags text;

-- ============================================================
-- Client read access to content_calendar_items
-- Clients can see items in review/approved/scheduled/published status
-- ============================================================

CREATE POLICY "Clients read own approved content_calendar_items"
  ON content_calendar_items FOR SELECT
  USING (
    status IN ('client_review', 'client_approved', 'approved', 'scheduled', 'published')
    AND client_id IN (
      SELECT cu.client_id FROM client_users cu WHERE cu.auth_user_id = auth.uid()
    )
  );

-- ============================================================
-- Client read access to content_cycles (limited)
-- Clients can see their cycle status but not strategy notes
-- ============================================================

CREATE POLICY "Clients read own content_cycles"
  ON content_cycles FOR SELECT
  USING (
    client_id IN (
      SELECT cu.client_id FROM client_users cu WHERE cu.auth_user_id = auth.uid()
    )
  );
