-- 155_onboarding_restaurant_fields.sql
-- Adds the two genuinely-new restaurant onboarding fields. Everything else
-- the redesigned wizard collects (price_range, signature_items,
-- customer_age_range, avoid_tone_tags, emoji_usage) already exists on
-- client_profiles from migration 043 -- the wizard just never asked for it.
--
--   dietary_options : what the kitchen can accommodate (vegan, GF, halal...)
--   slow_periods    : per-day busy/steady/slow rhythm, so the AI knows WHEN
--                     to push promotions. Shape: { "Mon": "slow", "Sat": "busy" }

ALTER TABLE client_profiles
  ADD COLUMN IF NOT EXISTS dietary_options text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS slow_periods jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN client_profiles.dietary_options IS
  'Dietary accommodations the restaurant offers (vegan, vegetarian, gluten-free, halal, etc.). Collected during onboarding.';
COMMENT ON COLUMN client_profiles.slow_periods IS
  'Per-day demand rhythm map { day: busy|steady|slow }. Tells the AI when to schedule promotions.';
