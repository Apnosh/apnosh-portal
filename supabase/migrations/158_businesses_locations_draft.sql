-- ============================================================
-- Migration 158: Onboarding draft column for additional locations
-- ============================================================
-- Multi-location businesses (e.g. a 2-spot BBQ chain) can now list
-- their other locations during the deep onboarding wizard
-- (/onboarding/full). Like migrations 156 and 157, this is mirrored as
-- a DRAFT column on `businesses` purely so a half-finished wizard
-- restores losslessly on resume.
--
-- At completion it is promoted to its real home:
--   - locations_draft -> client_locations rows (043), one per address.
--     The primary address (businesses.address) is seeded as
--     is_primary=true; each draft entry as is_primary=false.
--
-- Additive + IF NOT EXISTS so re-running is safe.
-- ============================================================

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS locations_draft jsonb DEFAULT '[]'::jsonb;

comment on column businesses.locations_draft is
  'Onboarding draft of additional locations (array of {name, full_address, city, state, zip, place_id}); promoted to client_locations rows at completion.';

notify pgrst, 'reload schema';
