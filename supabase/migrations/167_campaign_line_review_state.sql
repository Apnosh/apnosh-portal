-- 167 · Campaign line items: handler, AI-drafted content, and timing label.
--
-- Additive and idempotent. Three new columns on campaign_line_items:
--   handler    — who builds the piece by default (apnosh|ai|hybrid), so the
--                per-line handler chip renders without a catalog lookup.
--   draft      — AI-drafted copy for the piece ({title?, body}) from the
--                "AI builds it" path.
--   when_label — relative timing from the play blueprint ("10 days before").
--                (`when` is a reserved word, hence when_label.)
--
-- Approval-before-ship is handled at the CAMPAIGN level (the campaigns.phase
-- column: 'review' → owner approves → 'monitor'/status 'shipped'), so no
-- per-line review-state column is needed yet. A future per-deliverable
-- approve/request-change flow would add one in its own migration.
--
-- No RLS change: these inherit the existing campaign_line_items policies.

alter table campaign_line_items
  add column if not exists handler text,
  add column if not exists draft jsonb,
  add column if not exists when_label text;
