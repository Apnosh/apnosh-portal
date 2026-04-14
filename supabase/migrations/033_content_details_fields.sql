-- ============================================================
-- Migration 033: Content Details Fields
-- Add missing fields for adaptive content type forms
-- ============================================================

ALTER TABLE content_calendar_items
  ADD COLUMN IF NOT EXISTS text_overlays text,
  ADD COLUMN IF NOT EXISTS pacing_notes text,
  ADD COLUMN IF NOT EXISTS editing_style_value text, -- chip value: fast_cuts, cinematic, raw, text_driven, montage, custom
  ADD COLUMN IF NOT EXISTS editing_style_custom text,
  ADD COLUMN IF NOT EXISTS music_feel_value text, -- chip value: upbeat, chill, trending, cinematic, acoustic, electronic, custom
  ADD COLUMN IF NOT EXISTS music_feel_custom text,
  ADD COLUMN IF NOT EXISTS carousel_slide_count integer DEFAULT 5,
  ADD COLUMN IF NOT EXISTS carousel_flow text,
  ADD COLUMN IF NOT EXISTS carousel_slides jsonb DEFAULT '[]', -- [{slide_number, headline}]
  ADD COLUMN IF NOT EXISTS story_interactive_element text, -- poll, question, slider, quiz, link, countdown, none
  ADD COLUMN IF NOT EXISTS headline_text text,
  ADD COLUMN IF NOT EXISTS mood_tags text[],
  ADD COLUMN IF NOT EXISTS color_preference text,
  ADD COLUMN IF NOT EXISTS call_to_action text[],
  ADD COLUMN IF NOT EXISTS urgency text DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS internal_note text,
  ADD COLUMN IF NOT EXISTS avoid_text text,
  ADD COLUMN IF NOT EXISTS reference_link text,
  ADD COLUMN IF NOT EXISTS who_on_camera text,
  ADD COLUMN IF NOT EXISTS shoot_date text,
  ADD COLUMN IF NOT EXISTS shoot_flexible boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS footage_source text,
  ADD COLUMN IF NOT EXISTS script_style text,
  ADD COLUMN IF NOT EXISTS music_owner text,
  ADD COLUMN IF NOT EXISTS include_logo boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS source_stock_photo boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS avoid_colors text,
  ADD COLUMN IF NOT EXISTS avoid_styles text,
  ADD COLUMN IF NOT EXISTS placement text;
