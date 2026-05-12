-- ─────────────────────────────────────────────────────────────
-- 117_content_drafts_outcome_summary.sql
--
-- Migration 107 declared outcome_summary on content_drafts but the
-- column didn't make it to the live DB. Adding it here so the
-- attach-outcome flow can stamp the draft with a snapshot of the
-- platform metrics (rendered inline in /work/drafts as the engagement
-- badge, without joining to social_posts).
-- ─────────────────────────────────────────────────────────────

alter table content_drafts
  add column if not exists outcome_summary jsonb;

comment on column content_drafts.outcome_summary is
  'Snapshot of the published post outcome: { platform, external_id, reach, interactions, engagement_rate, attached_at }. Set by /api/work/drafts/[id]/attach-outcome. social_posts is the canonical source; this is a denormalized read for fast list rendering.';
