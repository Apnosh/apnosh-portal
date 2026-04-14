-- ============================================================
-- Migration 030: Multi-platform + Content Defaults
-- ============================================================

-- Allow calendar items to target multiple platforms
ALTER TABLE content_calendar_items
  ADD COLUMN IF NOT EXISTS additional_platforms text[] DEFAULT '{}';

-- Content defaults per client (persists across months)
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS content_defaults jsonb DEFAULT '{}';
-- Structure:
-- {
--   "default_platforms": ["instagram", "tiktok"],
--   "default_times": { "mon": "10:00", "tue": "10:00", "wed": "12:00", "thu": "10:00", "fri": "17:00", "sat": "11:00", "sun": "11:00" },
--   "default_goal": "awareness",
--   "default_batch_prefix": "Session",
--   "auto_cross_post": true,
--   "content_type_split": { "reels": 25, "feed_posts": 40, "carousels": 15, "stories": 20 }
-- }
