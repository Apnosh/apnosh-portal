-- Restaurant-specific onboarding fields. Apnosh's primary market is
-- restaurants, so the streamlined /onboarding flow asks for these
-- right alongside the basics. Storing them as columns (rather than
-- jsonb) so the AM admin can filter / segment by them later.

alter table businesses
  add column if not exists restaurant_subtype text,
  add column if not exists price_tier text,
  add column if not exists reservations_platform text,
  add column if not exists delivery_platforms text[];

-- Soft enum hints; not enforced because Apnosh may want to add new
-- subtypes / platforms without a migration each time. The streamlined
-- onboarding form constrains user input to known values.

comment on column businesses.restaurant_subtype is
  'restaurant / cafe / bar / food_truck / bakery / catering / ghost_kitchen / other';
comment on column businesses.price_tier is
  '$ / $$ / $$$ / $$$$';
comment on column businesses.reservations_platform is
  'opentable / resy / tock / yelp / in_house / none';
comment on column businesses.delivery_platforms is
  'array of: doordash / ubereats / grubhub / toast / own / none';
