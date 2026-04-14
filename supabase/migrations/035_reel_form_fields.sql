-- Reel form overhaul fields
ALTER TABLE content_calendar_items
  ADD COLUMN IF NOT EXISTS script_framework text,
  ADD COLUMN IF NOT EXISTS visual_hook text,
  ADD COLUMN IF NOT EXISTS audio_hook text,
  ADD COLUMN IF NOT EXISTS script_beats jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS b_roll jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS wardrobe_notes text,
  ADD COLUMN IF NOT EXISTS equipment_notes text,
  ADD COLUMN IF NOT EXISTS subtitle_style text DEFAULT 'bold_centered',
  ADD COLUMN IF NOT EXISTS cover_frame text,
  ADD COLUMN IF NOT EXISTS adapt_formats text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS editing_reference_link text,
  ADD COLUMN IF NOT EXISTS cta_text text;
