-- 202 — Owner-run walkthrough mode on line items (the GBP "Who does it" lanes).
--
-- The "Polish your Google profile" card now has THREE lanes:
--   ① "I'll do it myself"     — producer 'diy', $0, owner_mode 'diy'  (plain checklist)
--   ② "Do it with Apnosh AI"  — producer 'diy', $0, owner_mode 'ai'   (AI drafts each fix; Pro-gated)
--   ③ "Apnosh does it"        — producer 'team', $365                 (done for you, unchanged)
--
-- ① and ② are BOTH owner-run ($0, producer 'diy', no staff work order) and differ ONLY
-- by the post-ship walkthrough mode. owner_mode records the chosen lane so the
-- /dashboard/google-profile fixer renders the right mode (and never serves AI to a
-- client who is no longer Pro — the page re-checks the live tier). Additive + nullable:
-- team lines and legacy owner-run lines never set it and resolve to the checklist.

ALTER TABLE campaign_line_items ADD COLUMN IF NOT EXISTS owner_mode text;

-- Guard the value at the DB so a bad write can never land an unknown mode. NULL is
-- allowed (team lines + legacy owner-run lines). Idempotent re-create.
DO $$
BEGIN
  ALTER TABLE campaign_line_items DROP CONSTRAINT IF EXISTS campaign_line_items_owner_mode_check;
  ALTER TABLE campaign_line_items ADD CONSTRAINT campaign_line_items_owner_mode_check
    CHECK (owner_mode IS NULL OR owner_mode IN ('diy', 'ai'));
END $$;
