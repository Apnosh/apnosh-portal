-- Task Execution Layer: team defaults, deliverables, notes, revision tracking

-- 1. Extend team_members with external flag and expanded roles
ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS is_external boolean DEFAULT false;

-- Drop and recreate role check to allow new roles
-- (safe: IF NOT EXISTS on original won't re-add the constraint)
ALTER TABLE team_members DROP CONSTRAINT IF EXISTS team_members_role_check;
ALTER TABLE team_members ADD CONSTRAINT team_members_role_check
  CHECK (role IN ('videographer', 'editor', 'designer', 'copywriter', 'strategist', 'admin', 'account_manager'));

-- 2. Client team defaults (auto-assign roles per client)
CREATE TABLE IF NOT EXISTS client_team_defaults (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('videographer', 'editor', 'designer', 'copywriter')),
  team_member_id uuid NOT NULL REFERENCES team_members(id),
  UNIQUE(client_id, role)
);

ALTER TABLE client_team_defaults ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage client_team_defaults" ON client_team_defaults FOR ALL USING (is_admin());

-- 3. Task deliverables (files/links per stage per content item)
CREATE TABLE IF NOT EXISTS task_deliverables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id uuid NOT NULL REFERENCES content_calendar_items(id) ON DELETE CASCADE,
  stage text NOT NULL CHECK (stage IN ('filming', 'editing', 'design', 'caption')),
  revision_number integer DEFAULT 1,
  type text NOT NULL CHECK (type IN ('file', 'link')),
  file_url text,
  external_url text,
  file_name text,
  file_type text,
  notes text,
  submitted_by uuid REFERENCES team_members(id),
  submitted_at timestamptz DEFAULT now(),
  review_status text DEFAULT 'pending' CHECK (review_status IN ('pending', 'approved', 'revision_requested')),
  review_notes text,
  reviewed_by uuid,
  reviewed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_deliverables_item
  ON task_deliverables(content_item_id, stage, revision_number DESC);

ALTER TABLE task_deliverables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage task_deliverables" ON task_deliverables FOR ALL USING (is_admin());

-- 4. Task notes (per stage per content item)
CREATE TABLE IF NOT EXISTS task_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id uuid NOT NULL REFERENCES content_calendar_items(id) ON DELETE CASCADE,
  stage text NOT NULL,
  note_text text NOT NULL,
  created_by uuid REFERENCES team_members(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE task_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage task_notes" ON task_notes FOR ALL USING (is_admin());

-- 5. Max revisions per cycle (default 2)
ALTER TABLE content_cycles
  ADD COLUMN IF NOT EXISTS max_revisions integer DEFAULT 2;
