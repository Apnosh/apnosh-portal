-- ============================================================
-- 024 — Team assignments, link tracking, hashtag sets
-- ============================================================

-- Client goals (for onboarding + AI insights)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS goals jsonb NOT NULL DEFAULT '[]';

-- Team member assignments on content requests
ALTER TABLE content_queue
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES team_members(id);

CREATE INDEX IF NOT EXISTS idx_content_queue_assigned
  ON content_queue(assigned_to) WHERE assigned_to IS NOT NULL;

-- Link tracking (shortened URLs with click counts)
CREATE TABLE IF NOT EXISTS tracked_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  original_url text NOT NULL,
  short_code text UNIQUE NOT NULL,
  click_count int NOT NULL DEFAULT 0,
  created_by uuid REFERENCES team_members(id),
  scheduled_post_id uuid REFERENCES scheduled_posts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tracked_links_code ON tracked_links(short_code);
ALTER TABLE tracked_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage tracked_links" ON tracked_links FOR ALL USING (is_admin());
CREATE POLICY "Client reads own tracked_links" ON tracked_links FOR SELECT USING (client_id = current_client_id());

-- Saved hashtag sets per client
CREATE TABLE IF NOT EXISTS hashtag_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  hashtags text[] NOT NULL DEFAULT '{}',
  category text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE hashtag_sets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage hashtag_sets" ON hashtag_sets FOR ALL USING (is_admin());
CREATE POLICY "Client reads own hashtag_sets" ON hashtag_sets FOR SELECT USING (client_id = current_client_id());
