-- ============================================================
-- Migration 160: Persist the primary location's Google place_id
-- ============================================================
-- During onboarding (/onboarding/full) the owner picks their main
-- spot from Google search, which gives us its place_id. We were using
-- that id only in-session (to auto-pull hours/phone) but never saving
-- it, so it was lost on resume and never made it onto the primary
-- client_locations row at completion -- even though EXTRA locations
-- kept their place_id. That left the most important location with no
-- Google Business Profile linkage for reviews / local-SEO tooling.
--
-- This DRAFT column on `businesses` lets the wizard restore the id
-- losslessly on resume. At completion it is promoted onto the
-- is_primary=true client_locations row as gbp_place_id.
--
-- Additive + IF NOT EXISTS so re-running is safe.
-- ============================================================

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS primary_place_id text;

comment on column businesses.primary_place_id is
  'Onboarding draft of the primary location''s Google place_id; promoted to the is_primary client_locations row (gbp_place_id) at completion.';

notify pgrst, 'reload schema';
