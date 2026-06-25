-- Per-order claim for brief (re)generation, so two concurrent Regenerate clicks
-- (or owner + creator at once) don't each fire a separate billed AI call. The
-- claimer sets brief_generating_at; a loser sees a fresh lock and returns the
-- current brief without generating. A lock older than 30s is treated as stale
-- (a crashed generation) and re-claimable.

alter table creator_work_orders add column if not exists brief_generating_at timestamptz;
