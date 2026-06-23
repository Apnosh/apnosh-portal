-- Link content_drafts to the campaign that spawned them.
--
-- When an owner ships a team-run campaign, we materialize its content beats as
-- content_drafts (status 'idea') so the production team has real work items, and
-- so a campaign can later show real per-piece status. campaign_id makes that
-- link and gives the ship handler an idempotency key (skip if drafts exist).
--
-- Additive + nullable; on campaign delete the drafts survive (set null) so
-- produced/published work is never lost. Status stays 'idea' on creation, so the
-- publish-scheduled cron (which only acts on status='scheduled') never auto-sends
-- them — the team produces and schedules them.

alter table content_drafts
  add column if not exists campaign_id uuid references campaigns(id) on delete set null;

create index if not exists content_drafts_campaign
  on content_drafts (campaign_id) where campaign_id is not null;
