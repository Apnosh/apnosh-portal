-- Per-stage production status tracking
ALTER TABLE content_calendar_items
  ADD COLUMN IF NOT EXISTS concept_status text DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS script_status text DEFAULT 'not_applicable',
  ADD COLUMN IF NOT EXISTS filming_status text DEFAULT 'not_applicable',
  ADD COLUMN IF NOT EXISTS editing_status text DEFAULT 'not_applicable',
  ADD COLUMN IF NOT EXISTS design_status text DEFAULT 'not_applicable',
  ADD COLUMN IF NOT EXISTS caption_status text DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS script_assigned_to uuid,
  ADD COLUMN IF NOT EXISTS filming_assigned_to uuid,
  ADD COLUMN IF NOT EXISTS editing_assigned_to uuid,
  ADD COLUMN IF NOT EXISTS design_assigned_to uuid,
  ADD COLUMN IF NOT EXISTS caption_assigned_to uuid;

-- Shareable link tokens for external team members
CREATE TABLE IF NOT EXISTS production_share_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES content_cycles(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  role_filter text NOT NULL CHECK (role_filter IN ('videographer', 'editor', 'designer', 'copywriter', 'all')),
  token text NOT NULL UNIQUE,
  created_by uuid,
  expires_at timestamptz NOT NULL,
  revoked boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_share_links_token ON production_share_links(token);
