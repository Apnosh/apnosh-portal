-- Adds an array of GBP location-name aliases per client so the backfill
-- matcher can route locations whose Manager-UI name differs from the
-- client.name in our DB (e.g. "Do Si Korean BBQ Alki" -> client "Do Si").

alter table clients
  add column if not exists gbp_location_aliases text[] not null default '{}';

comment on column clients.gbp_location_aliases is
  'Alternate location names from Google Business Profile that should route to this client during CSV backfill (case-insensitive, normalized at match time).';

notify pgrst, 'reload schema';
