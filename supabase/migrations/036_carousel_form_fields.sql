-- Carousel form overhaul fields
ALTER TABLE content_calendar_items
  ADD COLUMN IF NOT EXISTS carousel_framework text,
  ADD COLUMN IF NOT EXISTS cover_headline text,
  ADD COLUMN IF NOT EXISTS cover_subheadline text,
  ADD COLUMN IF NOT EXISTS cover_image_direction text,
  ADD COLUMN IF NOT EXISTS cta_slide_headline text,
  ADD COLUMN IF NOT EXISTS cta_slide_notes text,
  ADD COLUMN IF NOT EXISTS cta_include_handle boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS carousel_aspect_ratio text DEFAULT 'square_1x1';
-- carousel_slides, carousel_flow, carousel_slide_count already exist from migration 033
