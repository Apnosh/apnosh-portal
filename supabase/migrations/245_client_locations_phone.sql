-- 245: per-location phone.
-- Onboarding pulls each spot's phone from its Google listing, but the
-- client_locations seed had nowhere to put it (hours survived, phone did not).
-- The seeder falls back to inserting without phone until this runs.
alter table client_locations add column if not exists phone text;
comment on column client_locations.phone is
  'This location''s phone. May differ from the business-level phone on clients.';
