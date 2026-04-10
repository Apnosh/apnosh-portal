-- ============================================================
-- 018 — Cancelled status
-- ------------------------------------------------------------
-- Adds a 'cancelled' status so a request that's been rejected
-- (revisions exhausted, client cancels, or admin closes) lands
-- in the History tab instead of staying live in the queue.
-- ============================================================

ALTER TABLE content_queue
  DROP CONSTRAINT IF EXISTS content_queue_status_check;

ALTER TABLE content_queue
  ADD CONSTRAINT content_queue_status_check
  CHECK (status IN ('new', 'confirmed', 'drafting', 'in_review', 'approved', 'scheduled', 'posted', 'cancelled'));

ALTER TABLE content_queue
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

ALTER TABLE content_queue
  ADD COLUMN IF NOT EXISTS cancelled_reason text;
