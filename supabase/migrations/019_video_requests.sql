-- ============================================================
-- 019 — Video request structured data
-- ------------------------------------------------------------
-- Mirrors graphic_requests for short-form video. 1:1 link to a
-- content_queue row so the existing approval / draft / feedback
-- pipeline applies — just with a richer creative brief and a
-- video file as the deliverable.
-- ============================================================

CREATE TABLE IF NOT EXISTS video_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_queue_id uuid NOT NULL UNIQUE REFERENCES content_queue(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  submitted_by_user_id uuid REFERENCES client_users(id),
  submitted_at timestamptz NOT NULL DEFAULT now(),

  -- Step 1: Content type (same enum as graphic_requests)
  content_type text NOT NULL CHECK (content_type IN (
    'promo', 'product', 'event', 'seasonal', 'educational',
    'testimonial', 'bts', 'brand', 'other'
  )),

  -- Step 2: Single vs series
  is_series boolean NOT NULL DEFAULT false,
  series_episode_count int CHECK (series_episode_count BETWEEN 2 AND 6),

  -- Step 3: Main message
  main_message text,

  -- Step 4: Hook (first 3 seconds)
  hook text,

  -- Step 5: Call to action (multi-select)
  call_to_action text[] NOT NULL DEFAULT '{}',

  -- Step 6: Length
  length_preference text CHECK (length_preference IN (
    'under_15', '15_30', '30_60', '60_90', 'apnosh_decides'
  )),

  -- Step 7: Script ownership
  script_owner text CHECK (script_owner IN ('apnosh', 'client', 'collab')),

  -- Step 8: Script delivery style
  script_style text CHECK (script_style IN ('voiceover', 'on_screen', 'both', 'apnosh_decides')),

  -- Step 9: Voiceover tone (nullable; only if voiceover/both)
  voiceover_tone text CHECK (voiceover_tone IN (
    'energetic', 'calm', 'professional', 'fun', 'apnosh_decides'
  )),

  -- Step 10: Footage source
  footage_source text CHECK (footage_source IN (
    'client_clips', 'animated', 'stock', 'apnosh_films', 'mix'
  )),

  -- Step 11: Shoot details (only if Apnosh films)
  shoot_location text,
  shoot_date date,
  shoot_flexible boolean,
  shoot_subject text,
  shoot_who_on_camera text CHECK (shoot_who_on_camera IN (
    'just_me', 'two_three', 'full_team', 'no_people', 'apnosh_decides'
  )),

  -- Step 12: Music ownership
  music_owner text CHECK (music_owner IN ('apnosh', 'client', 'none')),

  -- Step 13: Music feel
  music_feel text CHECK (music_feel IN (
    'hype', 'chill', 'emotional', 'trending', 'corporate', 'apnosh_decides'
  )),

  -- Step 14: Vibe (multi-select)
  mood_tags text[] NOT NULL DEFAULT '{}',

  -- Step 15: Editing style
  editing_style text CHECK (editing_style IN (
    'cinematic', 'trendy', 'documentary', 'clean', 'ugc', 'motion', 'slideshow', 'apnosh_decides'
  )),

  -- Step 16: Reference link
  reference_link text,

  -- Step 17: Avoid notes
  avoid_text text,

  -- Step 18: Platforms (multi-select)
  platforms text[] NOT NULL DEFAULT '{}',

  -- Step 19: Timing
  publish_date date,
  urgency text CHECK (urgency IN ('flexible', 'standard', 'urgent')),

  -- Reference assets uploaded by the client (clips, mood images, etc.)
  reference_asset_urls text[] NOT NULL DEFAULT '{}',

  -- Private note shown only to admin
  internal_note text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_video_requests_client ON video_requests(client_id);
CREATE INDEX IF NOT EXISTS idx_video_requests_content_queue ON video_requests(content_queue_id);
CREATE INDEX IF NOT EXISTS idx_video_requests_content_type ON video_requests(content_type);

-- ── RLS ─────────────────────────────────────────────────────
ALTER TABLE video_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage video_requests" ON video_requests;
CREATE POLICY "Admins manage video_requests" ON video_requests
  FOR ALL USING (is_admin());

DROP POLICY IF EXISTS "Client reads own video_requests" ON video_requests;
CREATE POLICY "Client reads own video_requests" ON video_requests
  FOR SELECT USING (client_id = current_client_id());

DROP POLICY IF EXISTS "Client submits video_requests" ON video_requests;
CREATE POLICY "Client submits video_requests" ON video_requests
  FOR INSERT WITH CHECK (client_id = current_client_id());

-- Realtime
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE video_requests;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
