-- 212_content_override_requirements — let admin edit a campaign's "What we'll need
-- from you" list from the campaign page builder, instead of it only deriving from
-- the services. Stored as a JSON array of plain strings. NULL = the derived list.
alter table catalog_content_overrides
  add column if not exists requirements jsonb;

comment on column catalog_content_overrides.requirements is 'Product-page "What we''ll need from you" list (["Connect your Google profile",...]). NULL = derived from services.';
