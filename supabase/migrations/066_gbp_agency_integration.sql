-- ============================================================
-- Migration 066: agency-wide Google Business integration
-- ============================================================
-- Until now `integrations` only stored Apnosh's Drive token. Add
-- google_business as a second provider so the agency-wide GBP API
-- token (granted by apnosh@gmail.com which holds Manager access on
-- all 21 locations) can be stored alongside Drive.
--
-- Pure widening of an existing check constraint -- no schema or data
-- migration, no impact on existing rows.
-- ============================================================

alter table integrations
  drop constraint if exists integrations_provider_check;

alter table integrations
  add constraint integrations_provider_check
  check (provider in ('google_drive', 'google_business'));

-- Reload PostgREST schema cache
notify pgrst, 'reload schema';
