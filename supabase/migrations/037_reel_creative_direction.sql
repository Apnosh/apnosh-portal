-- Reel creative direction + enhanced editor fields
ALTER TABLE content_calendar_items
  ADD COLUMN IF NOT EXISTS emotional_target text,
  ADD COLUMN IF NOT EXISTS target_audience_specific text,
  ADD COLUMN IF NOT EXISTS strategic_context text,
  ADD COLUMN IF NOT EXISTS music_search_terms text,
  ADD COLUMN IF NOT EXISTS transition_notes text,
  ADD COLUMN IF NOT EXISTS reference_search_videographer text,
  ADD COLUMN IF NOT EXISTS reference_search_editor text,
  ADD COLUMN IF NOT EXISTS persistent_screen_elements text;
-- script_beats jsonb already exists — structure extended in app code
-- (beat_number, visual, audio_text, onscreen_text, direction_note)
