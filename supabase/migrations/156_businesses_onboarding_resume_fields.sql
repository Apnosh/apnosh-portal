-- 156_businesses_onboarding_resume_fields.sql
--
-- The deep onboarding wizard (/onboarding/full) saves progress to the
-- `businesses` row and restores from it so a half-finished flow can be
-- resumed. Migration 155 added the new restaurant fields to
-- `client_profiles` (the AI-readable layer written at completion), but
-- NOT to `businesses` -- so those answers were lost on resume.
--
-- Mirror them onto `businesses` so the wizard round-trips losslessly.
-- All additive, idempotent.

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS price_range        text,
  ADD COLUMN IF NOT EXISTS signature_items    text[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS dietary_options    text[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS slow_periods       jsonb   DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS customer_age_range text,
  ADD COLUMN IF NOT EXISTS avoid_tones        text[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS emoji_usage        text;
