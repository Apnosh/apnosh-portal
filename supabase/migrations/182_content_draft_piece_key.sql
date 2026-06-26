-- Post-ship production reconcile (Phase 5b): give a team-lane content_draft a stable
-- handle back to the campaign piece it was materialized from, so an edit to a shipped
-- campaign can match drafts to the new plan (add the new, archive the removed, re-date
-- the moved) the same way the creator lane matches orders by (discipline, slot). The
-- key is the piece's group:slot ("Video:0", "email:1"); null for any draft not minted
-- from a campaign piece. Additive + nullable — existing drafts are unaffected.

alter table content_drafts add column if not exists campaign_piece_key text;

create index if not exists content_drafts_campaign_piece on content_drafts(campaign_id, campaign_piece_key)
  where campaign_id is not null and campaign_piece_key is not null;
