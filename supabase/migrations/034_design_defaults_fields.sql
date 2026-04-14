-- Add supporting_text and photo_direction to content_calendar_items
ALTER TABLE content_calendar_items
  ADD COLUMN IF NOT EXISTS supporting_text text,
  ADD COLUMN IF NOT EXISTS photo_direction text;
