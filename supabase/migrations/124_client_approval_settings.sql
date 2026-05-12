-- Per-client approval flow preferences.
--
-- Different restaurant owners want different gates between idea and
-- live post. Some want a hard "client signs off before publish" rule.
-- Some trust their AM to publish straight through. Some require
-- media attached before any approval. Rather than hard-coding one
-- workflow, each client picks the toggles that match their process.
--
-- Defaults match the safest path: client sign-off required, no
-- direct strategist publish, no auto-publish, media optional until
-- the publish step itself.
--
-- Toggles, all booleans, all defaulted:
--   media_required_before_approval   default false
--   client_signoff_required          default true
--   allow_strategist_direct_publish  default false
--   auto_publish_on_signoff          default false

alter table clients
  add column if not exists approval_settings jsonb not null default jsonb_build_object(
    'media_required_before_approval', false,
    'client_signoff_required', true,
    'allow_strategist_direct_publish', false,
    'auto_publish_on_signoff', false
  );

comment on column clients.approval_settings is
  'Per-client toggles for the content approval flow. See docs for the supported keys.';

-- Backfill any null rows (NOT NULL clause covers new rows; existing
-- rows that pre-date this column also get the default).
update clients
   set approval_settings = jsonb_build_object(
     'media_required_before_approval', false,
     'client_signoff_required', true,
     'allow_strategist_direct_publish', false,
     'auto_publish_on_signoff', false
   )
 where approval_settings is null
    or approval_settings = '{}'::jsonb;
