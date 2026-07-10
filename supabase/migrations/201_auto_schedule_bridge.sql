-- The campaign publish bridge: shipped campaign pieces carry target_publish_date,
-- but only a manual staff click ever moved an approved draft to 'scheduled', so
-- campaign calendars never self-executed. The publish-scheduled cron now sweeps
-- approved + campaign-linked + dated + owner-signed drafts into 'scheduled'.
--
-- auto_scheduled_at records that the sweep scheduled this draft ONCE. A staff
-- unschedule (status back to 'approved') leaves the stamp in place, so the next
-- tick never bounces a deliberately-unscheduled draft back to 'scheduled'.
alter table content_drafts
  add column if not exists auto_scheduled_at timestamptz;

comment on column content_drafts.auto_scheduled_at is
  'Set once when the publish-scheduled cron auto-schedules this campaign piece at its target_publish_date; never cleared, so staff unschedule is not overridden by the sweep.';
