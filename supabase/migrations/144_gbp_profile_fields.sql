-- Persist Google Business Profile basic info into gbp_locations.
--
-- The Apnosh portal already reads these fields on demand via
-- gbp-listing.ts:getClientListing(), but we never PERSISTED them. That
-- meant the audit, the dashboard, and any cross-feature data lookup
-- saw a half-empty gbp_locations row (just store_code + location_name)
-- even when the actual GBP profile was fully populated.
--
-- This migration adds the basic profile columns, populated by the
-- new syncGBPProfileForClient() sync (Business Information API v1).

alter table gbp_locations add column if not exists phone text;
alter table gbp_locations add column if not exists website text;
alter table gbp_locations add column if not exists primary_category text;
alter table gbp_locations add column if not exists additional_categories jsonb;
alter table gbp_locations add column if not exists profile_description text;
alter table gbp_locations add column if not exists last_profile_sync_at timestamptz;

comment on column gbp_locations.phone is 'Primary phone from GBP (synced via Business Information API).';
comment on column gbp_locations.website is 'Website URL from GBP.';
comment on column gbp_locations.primary_category is 'Primary category displayName (e.g. "Mexican restaurant").';
comment on column gbp_locations.additional_categories is 'Array of {name, displayName} for additional categories.';
comment on column gbp_locations.profile_description is 'Long-form business description from GBP.';
comment on column gbp_locations.last_profile_sync_at is 'When syncGBPProfileForClient last ran for this location.';
