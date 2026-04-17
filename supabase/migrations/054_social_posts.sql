-- ============================================================================
-- 054: social_posts table (per-post content + metrics)
-- ============================================================================
-- Powers the content-first social performance page. Each row is one post on
-- one platform (Instagram, Facebook, etc.) with its most recent stats
-- snapshot. Lets us surface top-performing posts, content-type breakdowns,
-- posting cadence, and best-times-to-post insights.
-- ============================================================================

CREATE TABLE IF NOT EXISTS social_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  platform text NOT NULL,

  -- Source-of-truth identity from Meta
  external_id text NOT NULL,
  permalink text,

  -- Content metadata
  media_type text,           -- IMAGE / CAROUSEL_ALBUM / VIDEO / REELS
  media_product_type text,   -- FEED / REELS / STORY
  caption text,
  media_url text,
  thumbnail_url text,
  posted_at timestamptz NOT NULL,

  -- Most recent metrics snapshot
  reach integer,
  likes integer,
  comments integer,
  saves integer,
  shares integer,
  video_views integer,
  total_interactions integer,

  raw_data jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (client_id, platform, external_id)
);

CREATE INDEX IF NOT EXISTS idx_social_posts_client_posted
  ON social_posts(client_id, posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_posts_client_platform
  ON social_posts(client_id, platform);

ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "social_posts_client_select" ON social_posts
  FOR SELECT TO authenticated
  USING (client_id = current_client_id() OR client_id = current_user_client_id());

CREATE POLICY "social_posts_admin_all" ON social_posts
  FOR ALL TO authenticated
  USING (is_admin());
