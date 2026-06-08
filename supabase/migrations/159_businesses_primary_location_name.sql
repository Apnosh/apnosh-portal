-- ============================================================
-- Migration 159: Onboarding draft column for the primary location's name
-- ============================================================
-- The deep onboarding wizard (/onboarding/full) now collects how many
-- locations a business has up front (on the name step) and, for
-- multi-location owners, presents a uniform roster: Location 1, 2, 3...
-- each with its own name + address.
--
-- The primary address still lives in flat `businesses` columns
-- (full_address/city/state/zip/hours), but the roster lets the owner
-- nickname that first spot too (e.g. "Downtown"). This DRAFT column
-- mirrors that nickname purely so a half-finished wizard restores
-- losslessly on resume (like migrations 156/157/158).
--
-- At completion it is promoted to client_locations: the primary row's
-- location_name uses this nickname, falling back to the business name.
--
-- Additive + IF NOT EXISTS so re-running is safe.
-- ============================================================

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS primary_location_name text;

comment on column businesses.primary_location_name is
  'Onboarding draft nickname for the primary location (e.g. "Downtown"); seeds the is_primary=true client_locations row''s location_name at completion, falling back to the business name.';

notify pgrst, 'reload schema';
