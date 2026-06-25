-- Publish bridge: link a creator work order to the content_draft it becomes once
-- the owner approves the delivery. The approved creator piece is materialized as a
-- content_draft (status 'approved', carrying the delivered link + brief caption) so
-- it enters the SAME publish pipeline the team uses (the publish-scheduled cron),
-- instead of dead-ending at 'approved'. The FK is also the dedup key: a bridged
-- order is counted via its content_draft in the owner progress mirror, never twice.

alter table creator_work_orders
  add column if not exists content_draft_id uuid references content_drafts(id) on delete set null;

create index if not exists creator_work_orders_content_draft on creator_work_orders(content_draft_id);
