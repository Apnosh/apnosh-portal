-- 213_content_override_whats_included — let admin edit a campaign's "What you get"
-- list from the campaign page builder, instead of it only deriving from the services.
-- Stored as a JSON array of plain strings. NULL = the derived list. Add-on groups
-- (from optional services a customer toggles) still append below this base list.
alter table catalog_content_overrides
  add column if not exists whats_included jsonb;

comment on column catalog_content_overrides.whats_included is 'Product-page "What you get" base list (["We fix all 6 parts...",...]). NULL = derived from services.';
