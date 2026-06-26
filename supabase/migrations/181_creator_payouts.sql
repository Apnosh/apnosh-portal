-- Money-out (Phase 4): accrue the creator's payout per approved piece. A decoupled
-- ledger mirroring campaign_charges (money-in) — NO real transfer happens here. The
-- creator earns net = gross (what the owner paid, from the order's amount_cents)
-- minus Apnosh's take-rate (fee_percent). A later, owner-triggered step (a Stripe
-- Connect transfer to the creator's connected account) actually pays it out.
--
-- campaign_id / work_order_id are ON DELETE SET NULL (not cascade): deleting a
-- campaign or order must never erase money already owed to a creator (the lesson
-- from the Phase 3 review's cascade-erase finding).

create table if not exists creator_payouts (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references clients(id) on delete cascade,
  campaign_id   uuid references campaigns(id) on delete set null,
  work_order_id uuid references creator_work_orders(id) on delete set null,
  creator_id    text not null,
  gross_cents   int  not null default 0,                 -- what the owner paid for the piece
  fee_percent   numeric(5,2) not null default 20.00,     -- Apnosh take-rate at accrual
  fee_cents     int  not null default 0,                 -- Apnosh's cut
  net_cents     int  not null default 0,                 -- the creator's earnings (gross - fee)
  status        text not null default 'accrued' check (status in ('accrued','payable','paid','void')),
  created_at    timestamptz not null default now()
);

-- One payout per piece (accrual is idempotent on the order).
create unique index if not exists creator_payouts_work_order on creator_payouts(work_order_id) where work_order_id is not null;
create index if not exists creator_payouts_creator on creator_payouts(creator_id);
create index if not exists creator_payouts_campaign on creator_payouts(campaign_id);

alter table creator_payouts enable row level security;
drop policy if exists creator_payouts_admin on creator_payouts;
create policy creator_payouts_admin on creator_payouts for all using (is_admin()) with check (is_admin());
