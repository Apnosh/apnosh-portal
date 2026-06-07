-- ============================================================
-- Migration 157: Onboarding draft columns for menu, specials, discovery
-- ============================================================
-- The deep onboarding wizard (/onboarding/full) now captures a real
-- menu, recurring specials, and discovery inputs (brand hashtags +
-- target search keywords). Like migration 156, these are mirrored as
-- DRAFT columns on `businesses` purely so a half-finished wizard
-- restores losslessly on resume.
--
-- At completion they are promoted to their real homes:
--   - menu_items_draft  -> menu_items rows (077)
--   - specials_draft    -> client_specials rows (078)
--   - brand_hashtags / target_keywords -> client_knowledge_facts
--     (via syncOnboardingToKnowledge, category 'positioning')
--
-- All additive + IF NOT EXISTS so re-running is safe.
-- ============================================================

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS menu_items_draft jsonb   DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS specials_draft   jsonb   DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS brand_hashtags   text[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS target_keywords  text[]  DEFAULT '{}';

comment on column businesses.menu_items_draft is
  'Onboarding draft menu (array of {name, price, category}); promoted to menu_items at completion.';
comment on column businesses.specials_draft is
  'Onboarding draft specials (array of {title, time_window, details}); promoted to client_specials at completion.';
comment on column businesses.brand_hashtags is
  'Brand/owned hashtags captured at onboarding; surfaced to AI as knowledge facts.';
comment on column businesses.target_keywords is
  'Local SEO / search keywords captured at onboarding; surfaced to AI as knowledge facts.';

notify pgrst, 'reload schema';
