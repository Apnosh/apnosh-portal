-- Per-piece work orders: one order per content piece instead of one per
-- discipline, so two videos in a campaign are two separately-tracked,
-- separately-scheduled orders (each with its own due date + delivery) rather
-- than one slot that silently owns both.
--
-- `slot` is the 0-based piece index within its (campaign, discipline). The
-- uniqueness key moves from (campaign, discipline) to (campaign, discipline,
-- slot) so re-ship stays idempotent while multiple same-discipline pieces are
-- allowed.

alter table creator_work_orders add column if not exists slot smallint not null default 0;

drop index if exists creator_work_orders_campaign_disc;

create unique index if not exists creator_work_orders_campaign_disc_slot
  on creator_work_orders (campaign_id, discipline, slot);
