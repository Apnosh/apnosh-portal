-- ============================================================
-- Priority 1 feature tables
-- ============================================================
-- social_metrics, reviews, notification_preferences, onboarding_checklist
-- Plus category extension on notifications.

-- ── 1. Social metrics (monthly per-platform snapshot) ───────
CREATE TABLE IF NOT EXISTS social_metrics (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  platform text not null check (platform in ('instagram', 'facebook', 'tiktok', 'linkedin', 'google_business', 'youtube', 'twitter')),
  month integer not null check (month between 1 and 12),
  year integer not null check (year >= 2024),
  -- Volume
  posts_published integer not null default 0,
  posts_planned integer not null default 0,
  -- Reach / engagement
  total_reach integer not null default 0,
  total_impressions integer not null default 0,
  total_engagement integer not null default 0,  -- likes + comments + shares + saves
  likes integer not null default 0,
  comments integer not null default 0,
  shares integer not null default 0,
  saves integer not null default 0,
  -- Followers
  followers_count integer not null default 0,
  followers_change integer not null default 0,  -- delta from previous month
  -- Top post
  top_post_url text,
  top_post_caption text,
  top_post_engagement integer,
  top_post_image_url text,
  -- Metadata
  notes text,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(client_id, platform, month, year)
);

CREATE INDEX IF NOT EXISTS idx_social_metrics_client_month ON social_metrics(client_id, year DESC, month DESC);

DROP TRIGGER IF EXISTS social_metrics_updated_at ON social_metrics;
CREATE TRIGGER social_metrics_updated_at
  BEFORE UPDATE ON social_metrics
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 2. Reviews (Google + Yelp + future sources) ─────────────
CREATE TABLE IF NOT EXISTS reviews (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  source text not null check (source in ('google', 'yelp', 'facebook', 'tripadvisor', 'other')),
  external_id text,  -- source-specific review id, if any
  rating numeric(2, 1) not null check (rating >= 1 and rating <= 5),
  author_name text,
  author_avatar_url text,
  review_text text,
  review_url text,
  -- Response tracking
  response_text text,
  responded_at timestamptz,
  responded_by text,  -- 'client' | 'admin' | 'automated'
  -- Flags
  flagged boolean not null default false,  -- negative reviews needing attention
  flag_reason text,
  -- Metadata
  posted_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(client_id, source, external_id)
);

CREATE INDEX IF NOT EXISTS idx_reviews_client_posted ON reviews(client_id, posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_client_flagged ON reviews(client_id) WHERE flagged = true;
CREATE INDEX IF NOT EXISTS idx_reviews_client_unresponded ON reviews(client_id) WHERE responded_at IS NULL;

DROP TRIGGER IF EXISTS reviews_updated_at ON reviews;
CREATE TRIGGER reviews_updated_at
  BEFORE UPDATE ON reviews
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 3. Notification preferences ─────────────────────────────
-- One row per auth user with their preferences
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- Email digest
  email_enabled boolean not null default true,
  email_digest_frequency text not null default 'immediate' check (email_digest_frequency in ('immediate', 'daily', 'weekly', 'off')),
  -- In-portal categories (which types to show)
  notify_approvals boolean not null default true,
  notify_content_ready boolean not null default true,
  notify_reviews boolean not null default true,
  notify_messages boolean not null default true,
  notify_reports boolean not null default true,
  notify_billing boolean not null default true,
  notify_system boolean not null default true,
  updated_at timestamptz not null default now()
);

DROP TRIGGER IF EXISTS notification_preferences_updated_at ON notification_preferences;
CREATE TRIGGER notification_preferences_updated_at
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Extend notifications with a category column for filtering
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS category text;

-- ── 4. Onboarding checklist ─────────────────────────────────
-- Steps a client needs to complete during setup
CREATE TABLE IF NOT EXISTS onboarding_checklist (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  step_key text not null,
  step_label text not null,
  step_description text,
  sort_order integer not null default 0,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'completed', 'skipped')),
  completed_at timestamptz,
  completed_by uuid references auth.users(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(client_id, step_key)
);

CREATE INDEX IF NOT EXISTS idx_onboarding_client_status ON onboarding_checklist(client_id, status);

DROP TRIGGER IF EXISTS onboarding_checklist_updated_at ON onboarding_checklist;
CREATE TRIGGER onboarding_checklist_updated_at
  BEFORE UPDATE ON onboarding_checklist
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── RLS policies ────────────────────────────────────────────
ALTER TABLE social_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_checklist ENABLE ROW LEVEL SECURITY;

-- Admin full access
DO $$ BEGIN CREATE POLICY "Admins manage social_metrics" ON social_metrics FOR ALL USING (is_admin()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Admins manage reviews" ON reviews FOR ALL USING (is_admin()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Admins manage onboarding" ON onboarding_checklist FOR ALL USING (is_admin()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Dashboard users (via business.client_id) can read their own
DO $$ BEGIN
  CREATE POLICY "Dashboard user reads social_metrics" ON social_metrics FOR SELECT
    USING (client_id = current_user_client_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Dashboard user reads reviews" ON reviews FOR SELECT
    USING (client_id = current_user_client_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Dashboard user reads onboarding" ON onboarding_checklist FOR SELECT
    USING (client_id = current_user_client_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Client portal users (via client_users.auth_user_id) can read their own
DO $$ BEGIN
  CREATE POLICY "Client reads social_metrics" ON social_metrics FOR SELECT
    USING (client_id = current_client_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Client reads reviews" ON reviews FOR SELECT
    USING (client_id = current_client_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Client reads onboarding" ON onboarding_checklist FOR SELECT
    USING (client_id = current_client_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Notification preferences: users read/write their own
DO $$ BEGIN
  CREATE POLICY "Users read own notification prefs" ON notification_preferences FOR SELECT
    USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users upsert own notification prefs" ON notification_preferences FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Realtime ────────────────────────────────────────────────
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE reviews;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE social_metrics;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
