-- ============================================================
-- 017 — Confirmed status + revision counter
-- ------------------------------------------------------------
-- Adds a 'confirmed' step between 'new' (client submitted) and
-- 'drafting' (admin started work). Admin must explicitly confirm
-- a request before starting work, which triggers a notification
-- to the client.
--
-- Also adds revision_count + revision_limit to enforce a max
-- number of client revisions per request.
-- ============================================================

-- ── Drop and recreate the status check constraint to add 'confirmed' ──
ALTER TABLE content_queue
  DROP CONSTRAINT IF EXISTS content_queue_status_check;

ALTER TABLE content_queue
  ADD CONSTRAINT content_queue_status_check
  CHECK (status IN ('new', 'confirmed', 'drafting', 'in_review', 'approved', 'scheduled', 'posted'));

-- ── Add revision counter columns ──
ALTER TABLE content_queue
  ADD COLUMN IF NOT EXISTS revision_count int NOT NULL DEFAULT 0;

ALTER TABLE content_queue
  ADD COLUMN IF NOT EXISTS revision_limit int NOT NULL DEFAULT 2;

-- ── Add confirmed_at timestamp so we can show "confirmed Apr 10" on client side ──
ALTER TABLE content_queue
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;
