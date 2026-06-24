-- Creator work orders — the bridge that makes the campaign marketplace two-sided.
--
-- When an owner ships a campaign, each creative discipline (Video / Photo /
-- Design) with a chosen creator becomes a work order that creator receives,
-- accepts, produces, and delivers. This is the supply-side spine: the owner's
-- creator_choices pick (or the auto-match) becomes real, trackable work.
--
-- creator_id is the chosen creator's id (the seeded-pool id today, e.g. 'v_maya';
-- vendor_id links to a real vendors row once the pool is a live query). Keeping
-- both lets the order survive the swap to real supply without a data migration.

create table if not exists creator_work_orders (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns(id) on delete cascade,
  client_id uuid not null,
  creator_id text not null,                                  -- chosen creator id
  vendor_id uuid references vendors(id) on delete set null,  -- real vendor, when wired
  discipline text not null,                                  -- Video | Photo | Design
  title text not null,                                       -- short owner-facing label
  brief text,                                                -- what to make
  due_date date,
  status text not null default 'offered'
    check (status in ('offered','accepted','in_progress','delivered','approved','revision','declined')),
  delivered_url text,                                        -- where the creator dropped the work
  note text,                                                 -- owner/creator note (revision reason, etc.)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One order per (campaign, discipline) so a re-ship is idempotent.
create unique index if not exists creator_work_orders_campaign_disc
  on creator_work_orders (campaign_id, discipline);

create index if not exists creator_work_orders_creator on creator_work_orders (creator_id, status);
create index if not exists creator_work_orders_vendor on creator_work_orders (vendor_id) where vendor_id is not null;

alter table creator_work_orders enable row level security;

-- Admin (and the server's service role) manage everything; a creator can read +
-- update the status of the orders linked to their own vendor. Owner-side reads
-- go through the server (service role), so no client policy is needed for them.
do $$ begin
  create policy creator_work_orders_admin on creator_work_orders
    for all using (is_admin()) with check (is_admin());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy creator_work_orders_own_read on creator_work_orders
    for select using (vendor_id in (select v.id from vendors v where v.person_id = auth.uid()));
exception when duplicate_object then null; end $$;
