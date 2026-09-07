-- 253: order_promises — the ledger behind "Counted after … shows on Home".
--
-- Every Create card ends with a promise: the one number this order exists to move, who takes
-- the count, and the day it shows on Home. Until now nothing recorded that promise: a service
-- order minted a work order with no metric, campaign_outcomes only filled for wins after
-- 14 reported days each side, and the Home strip had nothing to read. This table writes the
-- promise WHEN THE ORDER MINTS (metric, count-from date, a 30-day baseline) and is read
-- always — wins, losses and flat months alike — so the owner sees "41, was 13" or "41, was 41",
-- never silence.
--
-- Tenancy: keyed on client_id (no business_id). Applied by hand in the Supabase SQL editor.

create table if not exists order_promises (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  campaign_id uuid references campaigns(id) on delete cascade,     -- store / builder orders
  creative_request_id uuid,                                         -- desk orders (no campaign row)
  service_id text,                                                  -- catalog service, e.g. 'gbp-setup'
  catalog_id text,                                                  -- store card id, e.g. 'gbp'
  label text not null,                                              -- the card's own words, e.g. 'Polish your Google profile'
  metric_key text not null,                                         -- see src/lib/promises/registry.ts
  metric_label text not null,                                       -- 'taps on your Google card'
  taken_by text not null default 'google'                           -- who takes the count
    check (taken_by in ('google','you','apnosh','person','site','social')),
  state text not null default 'counting'
    check (state in ('held','counting','counted','not_counted','done')),
  reason text,                                                      -- when not_counted: the card's own reason
  ordered_on date not null,
  start_on date,                                                    -- held orders: when work starts
  count_from date not null,                                         -- first day the count runs (ordered_on + lag)
  shows_on date not null,                                           -- the day Home shows a number
  baseline_value numeric,                                           -- the metric over baseline_days before count_from
  baseline_days integer,                                            -- reported days in that baseline
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists order_promises_client on order_promises (client_id, ordered_on desc);
create index if not exists order_promises_campaign on order_promises (campaign_id) where campaign_id is not null;
create unique index if not exists order_promises_campaign_metric
  on order_promises (campaign_id, service_id, metric_key) where campaign_id is not null;
create unique index if not exists order_promises_request_metric
  on order_promises (creative_request_id, metric_key) where creative_request_id is not null;

alter table order_promises enable row level security;
do $$ begin
  create policy order_promises_admin on order_promises
    for all using (is_admin()) with check (is_admin());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy order_promises_client_read on order_promises
    for select using (
      exists (select 1 from client_users cu where cu.client_id = order_promises.client_id and cu.auth_user_id = auth.uid())
    );
exception when duplicate_object then null; end $$;
