-- Money-in (Phase 3): charge the owner per delivered piece. A decoupled ACCRUAL
-- ledger — the honest record of what the owner owes for accepted pieces — kept
-- separate from Stripe so nothing here moves real money. A later, owner-triggered
-- step converts accrued charges into a real invoice via the existing billing rail
-- (billing-actions.createOneTimeInvoice). amount_cents is stamped on the order at
-- ship (the price the owner saw), and also feeds the Phase 4 creator payout.

alter table creator_work_orders add column if not exists amount_cents int not null default 0;

create table if not exists campaign_charges (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid not null references clients(id) on delete cascade,
  campaign_id      uuid references campaigns(id) on delete cascade,
  work_order_id    uuid references creator_work_orders(id) on delete set null,
  content_draft_id uuid references content_drafts(id) on delete set null,
  source           text not null default 'creator' check (source in ('creator','team')),
  amount_cents     int  not null default 0,
  status           text not null default 'accrued' check (status in ('accrued','invoiced','paid','void')),
  created_at       timestamptz not null default now()
);

-- One charge per piece (the accrual is idempotent on the source piece).
create unique index if not exists campaign_charges_work_order on campaign_charges(work_order_id) where work_order_id is not null;
create unique index if not exists campaign_charges_content_draft on campaign_charges(content_draft_id) where content_draft_id is not null;
create index if not exists campaign_charges_campaign on campaign_charges(campaign_id);

alter table campaign_charges enable row level security;
-- Admin/service-role only for now (the owner reads aggregates through the API,
-- which is already client-access scoped); mirrors creator_work_orders' posture.
drop policy if exists campaign_charges_admin on campaign_charges;
create policy campaign_charges_admin on campaign_charges for all using (is_admin()) with check (is_admin());
