-- ============================================================
-- 020 — Social Media Final Build
-- ------------------------------------------------------------
-- New tables for: team members, AM notes, calendar notes,
-- campaign tags, optimal send times, shareable calendar links,
-- global asset library (assets + asset_folders).
-- Alters: content_queue (failed/post_type fields),
--         monthly_reports (client_id + new columns).
-- ============================================================

-- ── 1. Team members ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL,
  email text NOT NULL,
  avatar_url text,
  role text NOT NULL DEFAULT 'account_manager'
    CHECK (role IN ('account_manager', 'designer', 'editor', 'admin')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage team_members" ON team_members FOR ALL USING (is_admin());
CREATE POLICY "Clients read active team_members" ON team_members FOR SELECT USING (is_active = true);

-- ── 2. AM client notes ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS am_client_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  note_text text NOT NULL,
  created_by uuid REFERENCES team_members(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_am_client_notes_client ON am_client_notes(client_id);
ALTER TABLE am_client_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage am_client_notes" ON am_client_notes FOR ALL USING (is_admin());
CREATE POLICY "Client reads own am_notes" ON am_client_notes FOR SELECT
  USING (client_id = current_client_id());

-- ── 3. Calendar notes ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS calendar_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  note_date date NOT NULL,
  note_text text NOT NULL,
  created_by uuid REFERENCES team_members(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calendar_notes_client_date ON calendar_notes(client_id, note_date);
ALTER TABLE calendar_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage calendar_notes" ON calendar_notes FOR ALL USING (is_admin());
CREATE POLICY "Client reads own calendar_notes" ON calendar_notes FOR SELECT
  USING (client_id = current_client_id());

-- ── 4. Campaign tags ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaign_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text DEFAULT '#4abd98',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaign_tags_client ON campaign_tags(client_id);
ALTER TABLE campaign_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage campaign_tags" ON campaign_tags FOR ALL USING (is_admin());
CREATE POLICY "Client reads own campaign_tags" ON campaign_tags FOR SELECT
  USING (client_id = current_client_id());

-- Junction: content_queue ↔ campaign_tags
CREATE TABLE IF NOT EXISTS post_campaign_tags (
  content_queue_id uuid NOT NULL REFERENCES content_queue(id) ON DELETE CASCADE,
  campaign_tag_id uuid NOT NULL REFERENCES campaign_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (content_queue_id, campaign_tag_id)
);

ALTER TABLE post_campaign_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage post_campaign_tags" ON post_campaign_tags FOR ALL USING (is_admin());
CREATE POLICY "Client reads own post_campaign_tags" ON post_campaign_tags FOR SELECT
  USING (content_queue_id IN (
    SELECT id FROM content_queue WHERE client_id = current_client_id()
  ));

-- ── 5. Optimal send times ───────────────────────────────────
CREATE TABLE IF NOT EXISTS optimal_send_times (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  platform text NOT NULL,
  day_of_week int NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  hour_of_day int NOT NULL CHECK (hour_of_day BETWEEN 0 AND 23),
  confidence float NOT NULL DEFAULT 0.5,
  calculated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_optimal_send_times_client ON optimal_send_times(client_id, platform);
ALTER TABLE optimal_send_times ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage optimal_send_times" ON optimal_send_times FOR ALL USING (is_admin());
CREATE POLICY "Client reads own optimal_send_times" ON optimal_send_times FOR SELECT
  USING (client_id = current_client_id());

-- ── 6. Shareable calendar links ─────────────────────────────
CREATE TABLE IF NOT EXISTS calendar_share_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  token text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  created_by_user uuid REFERENCES client_users(id),
  revoked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calendar_share_token ON calendar_share_links(token) WHERE NOT revoked;
ALTER TABLE calendar_share_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage calendar_share_links" ON calendar_share_links FOR ALL USING (is_admin());
CREATE POLICY "Client manages own calendar_share_links" ON calendar_share_links FOR ALL
  USING (client_id = current_client_id());

-- ── 7. Global asset library ─────────────────────────────────

-- Folders (1 level nesting)
CREATE TABLE IF NOT EXISTS asset_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  parent_folder_id uuid REFERENCES asset_folders(id) ON DELETE CASCADE,
  created_by_client boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asset_folders_client ON asset_folders(client_id);
ALTER TABLE asset_folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage asset_folders" ON asset_folders FOR ALL USING (is_admin());
CREATE POLICY "Client manages own asset_folders" ON asset_folders FOR ALL
  USING (client_id = current_client_id());

-- Assets
CREATE TABLE IF NOT EXISTS assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('image', 'video', 'text', 'document')),
  file_url text,
  file_size int,
  mime_type text,
  dimensions text,
  content text,  -- for text snippets only
  folder_id uuid REFERENCES asset_folders(id) ON DELETE SET NULL,
  tags text[] NOT NULL DEFAULT '{}',
  uploaded_by_client boolean NOT NULL DEFAULT false,
  uploaded_by_client_user uuid REFERENCES client_users(id),
  uploaded_by_team_member uuid REFERENCES team_members(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assets_client ON assets(client_id);
CREATE INDEX IF NOT EXISTS idx_assets_folder ON assets(client_id, folder_id);
CREATE INDEX IF NOT EXISTS idx_assets_type ON assets(client_id, type);
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage assets" ON assets FOR ALL USING (is_admin());
CREATE POLICY "Client reads own assets" ON assets FOR SELECT
  USING (client_id = current_client_id());
CREATE POLICY "Client inserts own assets" ON assets FOR INSERT
  WITH CHECK (client_id = current_client_id() AND uploaded_by_client = true);
CREATE POLICY "Client deletes own uploads" ON assets FOR DELETE
  USING (client_id = current_client_id() AND uploaded_by_client = true);

-- ── 8. Alter content_queue ──────────────────────────────────
ALTER TABLE content_queue
  ADD COLUMN IF NOT EXISTS failed_reason text;

ALTER TABLE content_queue
  ADD COLUMN IF NOT EXISTS post_type text
    CHECK (post_type IN ('graphic', 'reel', 'carousel', 'story', 'text'));

ALTER TABLE content_queue
  ADD COLUMN IF NOT EXISTS platform_post_id text;

-- ── 9. Alter monthly_reports ────────────────────────────────
ALTER TABLE monthly_reports
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES clients(id) ON DELETE CASCADE;

ALTER TABLE monthly_reports
  ADD COLUMN IF NOT EXISTS what_worked text[];

ALTER TABLE monthly_reports
  ADD COLUMN IF NOT EXISTS next_month_plan text[];

ALTER TABLE monthly_reports
  ADD COLUMN IF NOT EXISTS top_post_data jsonb;

ALTER TABLE monthly_reports
  ADD COLUMN IF NOT EXISTS pdf_url text;

ALTER TABLE monthly_reports
  ADD COLUMN IF NOT EXISTS created_by_team_member uuid REFERENCES team_members(id);

-- Add client-read policy for monthly_reports
DROP POLICY IF EXISTS "Client reads own monthly_reports" ON monthly_reports;
CREATE POLICY "Client reads own monthly_reports" ON monthly_reports FOR SELECT
  USING (
    client_id = current_client_id()
    AND status = 'published'
  );

-- ── 10. Realtime publications ───────────────────────────────
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE am_client_notes; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE calendar_notes; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE campaign_tags; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE assets; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE asset_folders; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE calendar_share_links; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 11. Storage bucket for global assets ────────────────────
-- Note: bucket 'client-assets' is created via the Supabase JS
-- client at app startup or manually. Policies below assume it exists.
-- The existing buckets (client-photos, post-drafts, video-drafts)
-- continue to serve their original purpose. The new 'client-assets'
-- bucket stores global asset library uploads.
