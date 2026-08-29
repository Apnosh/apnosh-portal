-- 248: per-location overrides (inherit from the business unless set here).
-- The brand holds the defaults; a location column left NULL means "same as
-- the business". Set a value only where that spot truly differs. Includes
-- the phone column from 245, so running THIS file alone is enough.
alter table client_locations add column if not exists phone text;
alter table client_locations add column if not exists website text;
alter table client_locations add column if not exists price_range text;
alter table client_locations add column if not exists biz_type text;
alter table client_locations add column if not exists cuisine text;
alter table client_locations add column if not exists menu_url text;

comment on column client_locations.website is 'Override. NULL = inherits the business website.';
comment on column client_locations.price_range is 'Override. NULL = inherits the business price range.';
comment on column client_locations.biz_type is 'Override, e.g. Cafe vs Market. NULL = inherits the business type.';
comment on column client_locations.cuisine is 'Override. NULL = inherits the business cuisine.';
comment on column client_locations.menu_url is 'Link to this location''s own menu. NULL = the shared business menu.';
