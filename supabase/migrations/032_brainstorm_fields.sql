-- Add content_category and week_number to content_calendar_items
ALTER TABLE content_calendar_items
  ADD COLUMN IF NOT EXISTS content_category text,
  ADD COLUMN IF NOT EXISTS week_number integer;

-- Update strategic_goal constraint to include 'education'
ALTER TABLE content_calendar_items DROP CONSTRAINT IF EXISTS content_calendar_items_strategic_goal_check;
ALTER TABLE content_calendar_items ADD CONSTRAINT content_calendar_items_strategic_goal_check
  CHECK (strategic_goal IN ('awareness', 'engagement', 'conversion', 'community', 'education'));
