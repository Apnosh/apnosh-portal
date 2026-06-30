-- 183 — Content Menu: per-piece handler + brief on line items, piece key on orders.
--
-- The campaign-builder redesign ("The Content Menu") collects, at add-time, who
-- makes each piece (team / a creator / the owner themselves) and a small per-piece
-- brief (the dish to feature, the offer, must-says). Those live on the line item —
-- the piece — instead of one campaign-wide execution object collected late.
--
--   producer  — 'team' | 'creator' | 'diy' | 'ai' (null on legacy lines → resolved
--               by the old positional producer_choices map, unchanged).
--   brief     — the add-piece modal answers for this one piece.
--   post_iso  — this piece's own post date (v2 honors per-piece dates; v1 uses the
--               single campaign date but stores the value losslessly).
--
-- And creator_work_orders gets the same stable per-piece KEY content_drafts got in
-- 182, so the post-ship reconcile can match a menu campaign's orders by their stable
-- line id instead of a positional discipline:slot (which a re-order would shift).
-- All columns are nullable / additive — legacy AI + strategist campaigns are wholly
-- unaffected (they never set these, and the readers fall back to today's behavior).

ALTER TABLE campaign_line_items ADD COLUMN IF NOT EXISTS producer text;
ALTER TABLE campaign_line_items ADD COLUMN IF NOT EXISTS brief jsonb;
ALTER TABLE campaign_line_items ADD COLUMN IF NOT EXISTS post_iso date;

ALTER TABLE creator_work_orders ADD COLUMN IF NOT EXISTS campaign_piece_key text;

-- Guard the producer value set at the DB so a bad write can never strand a piece in
-- an unroutable lane. NULL is allowed (legacy lines). Idempotent re-create.
DO $$
BEGIN
  ALTER TABLE campaign_line_items DROP CONSTRAINT IF EXISTS campaign_line_items_producer_check;
  ALTER TABLE campaign_line_items ADD CONSTRAINT campaign_line_items_producer_check
    CHECK (producer IS NULL OR producer IN ('team', 'creator', 'diy', 'ai'));
END $$;
