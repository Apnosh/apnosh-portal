-- Extend integrations table to support an agency-wide Meta OAuth token.
-- The Apnosh AM logs into Facebook once with their personal account
-- that has Business Manager admin access on every client Page. Apnosh
-- stores that token here, then uses it to read Instagram + Facebook
-- analytics for every client without each client needing to OAuth.
--
-- Mirrors the google_business agency pattern from migration 066.

alter table integrations
  drop constraint if exists integrations_provider_check;

alter table integrations
  add constraint integrations_provider_check
  check (provider in ('google_drive', 'google_business', 'meta_agency'));

comment on column integrations.provider is
  'Which third-party we authenticated against: google_drive (file storage), google_business (GBP locations cron), meta_agency (Apnosh staff Facebook/Instagram access for client analytics).';
