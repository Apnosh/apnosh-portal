-- ============================================================
-- 023 — Scheduled posts for multi-platform publishing
-- ============================================================

CREATE TABLE IF NOT EXISTS scheduled_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  created_by uuid REFERENCES team_members(id),

  -- Content
  text text NOT NULL,
  media_urls text[] NOT NULL DEFAULT '{}',
  media_type text CHECK (media_type IN ('image', 'video', 'carousel')),
  link_url text,

  -- Targeting
  platforms text[] NOT NULL DEFAULT '{}',

  -- Scheduling
  scheduled_for timestamptz,

  -- Status
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'publishing', 'published', 'partially_failed', 'failed')),
  platform_results jsonb NOT NULL DEFAULT '{}',

  -- Linkage
  content_queue_id uuid REFERENCES content_queue(id) ON DELETE SET NULL,
  campaign_tag_id uuid REFERENCES campaign_tags(id) ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_posts_client ON scheduled_posts(client_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_status ON scheduled_posts(status, scheduled_for);

ALTER TABLE scheduled_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage scheduled_posts" ON scheduled_posts FOR ALL USING (is_admin());
CREATE POLICY "Client reads own scheduled_posts" ON scheduled_posts FOR SELECT
  USING (client_id = current_client_id());

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE scheduled_posts;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
