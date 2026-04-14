-- ============================================================
-- Migration 031: Production Assignments
-- Sequential role-based task tracking for content production
-- ============================================================

-- Extend team_members role to include production roles
ALTER TABLE team_members DROP CONSTRAINT IF EXISTS team_members_role_check;
ALTER TABLE team_members ADD CONSTRAINT team_members_role_check
  CHECK (role IN ('account_manager', 'designer', 'editor', 'admin', 'videographer', 'copywriter', 'qa', 'strategist'));

-- Production assignments — one per role per content item
CREATE TABLE IF NOT EXISTS production_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES content_calendar_items(id) ON DELETE CASCADE,
  cycle_id uuid NOT NULL REFERENCES content_cycles(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('videographer', 'editor', 'designer', 'copywriter', 'qa')),
  step_order integer NOT NULL DEFAULT 0, -- sequential order: 1=first, 2=second, etc.
  team_member_id uuid REFERENCES team_members(id),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'in_progress', 'completed', 'blocked', 'revision')),
  due_date date,
  started_at timestamptz,
  completed_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(item_id, role)
);

CREATE INDEX idx_prod_assignments_item ON production_assignments(item_id);
CREATE INDEX idx_prod_assignments_cycle ON production_assignments(cycle_id, role, status);
CREATE INDEX idx_prod_assignments_member ON production_assignments(team_member_id, status);

-- RLS: admin only
ALTER TABLE production_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage production_assignments" ON production_assignments FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin')));

-- Team members can read their own assignments (for future role-specific dashboards)
CREATE POLICY "Team members read own assignments" ON production_assignments FOR SELECT
  USING (team_member_id IN (
    SELECT id FROM team_members WHERE auth_user_id = auth.uid()
  ));
