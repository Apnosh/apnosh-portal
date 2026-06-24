-- Persist the owner's chosen creators for a campaign's creative pieces.
--
-- Each creative discipline (Video / Photo / Design) gets an auto-matched default
-- creator; the owner can change it from the creator marketplace. This column
-- stores the override as { "Video": "<creatorId>", "Photo": "<creatorId>", ... }.
-- Disciplines with no entry fall back to the auto-matched default at render time.
--
-- Additive + non-null default '{}', so existing campaigns keep their defaults and
-- the read path degrades cleanly if this migration has not been applied yet.

alter table campaigns
  add column if not exists creator_choices jsonb not null default '{}'::jsonb;
