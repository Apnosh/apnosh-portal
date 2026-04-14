-- ============================================================
-- Migration 027: Content Engine
-- Admin-side AI content planning system
-- ============================================================

-- 1. content_cycles — Monthly content planning cycle per client
CREATE TABLE IF NOT EXISTS content_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  month date NOT NULL, -- first day of the month, e.g. '2026-05-01'
  status text NOT NULL DEFAULT 'not_started'
    CHECK (status IN (
      'not_started', 'context_ready', 'calendar_draft',
      'calendar_approved', 'briefs_draft', 'briefs_approved',
      'in_production', 'complete'
    )),
  assigned_to uuid, -- strategist user ID
  deliverables jsonb, -- { reels: 4, feed_posts: 8, stories: 4, platforms: ['instagram','facebook'] }
  context_snapshot jsonb, -- frozen context used for AI generations
  strategy_notes text, -- strategist's direction for this month
  client_requests jsonb, -- any ideas/requests the client submitted
  calendar_approved_at timestamptz,
  calendar_approved_by uuid,
  briefs_approved_at timestamptz,
  briefs_approved_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(client_id, month)
);

CREATE INDEX idx_content_cycles_status ON content_cycles(status, assigned_to);
CREATE INDEX idx_content_cycles_client ON content_cycles(client_id, month DESC);

-- 2. content_calendar_items — Individual content pieces within a cycle
CREATE TABLE IF NOT EXISTS content_calendar_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES content_cycles(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  -- Calendar fields
  scheduled_date date,
  scheduled_time time,
  platform text NOT NULL CHECK (platform IN ('instagram', 'facebook', 'tiktok', 'linkedin')),
  content_type text NOT NULL CHECK (content_type IN ('reel', 'feed_post', 'carousel', 'story')),
  concept_title text NOT NULL,
  concept_description text,
  strategic_goal text CHECK (strategic_goal IN ('awareness', 'engagement', 'conversion', 'community')),
  filming_batch text, -- batch tag: 'A', 'B', etc.

  -- Brief fields (populated in Step 5)
  script text,
  hook text,
  shot_list jsonb, -- [{ shot_number, description, setup_notes, angle }]
  props jsonb, -- ["cutting board", "ingredients"]
  location_notes text,
  music_direction text,
  estimated_duration text,
  caption text,
  hashtags text[],
  editor_notes text,
  platform_specs jsonb, -- { aspect_ratio, text_safe_zone }

  -- Metadata
  source text DEFAULT 'ai' CHECK (source IN ('ai', 'strategist', 'client_request')),
  status text DEFAULT 'draft'
    CHECK (status IN (
      'draft', 'strategist_approved', 'client_review', 'client_approved',
      'in_production', 'filming', 'editing', 'draft_ready',
      'client_draft_review', 'approved', 'scheduled', 'published'
    )),
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_calendar_items_cycle ON content_calendar_items(cycle_id, sort_order);
CREATE INDEX idx_calendar_items_batch ON content_calendar_items(cycle_id, filming_batch);

-- 3. content_templates — Reusable proven content formats
CREATE TABLE IF NOT EXISTS content_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  content_type text NOT NULL CHECK (content_type IN ('reel', 'feed_post', 'carousel', 'story')),
  title text NOT NULL,
  description text,
  typical_performance text,
  created_by uuid,
  times_used integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_content_templates_client ON content_templates(client_id);

-- ============================================================
-- RLS — Admin-only tables (clients cannot access)
-- ============================================================

ALTER TABLE content_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_calendar_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_templates ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY "Admins manage content_cycles" ON content_cycles FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin')));

CREATE POLICY "Admins manage content_calendar_items" ON content_calendar_items FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin')));

CREATE POLICY "Admins manage content_templates" ON content_templates FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin')));
