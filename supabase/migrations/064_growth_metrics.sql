-- ============================================================
-- Migration 064: growth metrics + lifecycle events
-- ============================================================
-- Additive only. Captures the operational signals we've been tracking
-- in our heads (how clients find us, what acquisition cost, when
-- they renew, what happens when they leave) and exposes them as a
-- single `business_metrics` view for the reports page.
--
-- Nothing is replaced or redefined. All new columns use
-- `add column if not exists`, the new table uses
-- `create table if not exists`, and the new view uses
-- `create or replace view` (the view name does not exist yet).
--
-- No existing functions are redefined. Policies reference the
-- pre-existing `is_admin()` function from migration 001 without
-- altering it.
-- ============================================================


-- ============================================================
-- 1. clients: acquisition + lifecycle fields
-- ============================================================

alter table clients
  add column if not exists lead_source text
    check (lead_source is null or lead_source in
      ('referral','inbound_web','outbound','event','partnership','other'));

alter table clients
  add column if not exists lead_source_detail text;

alter table clients
  add column if not exists referred_by_client_id uuid
    references clients(id) on delete set null;

alter table clients
  add column if not exists acquisition_cost_cents integer
    check (acquisition_cost_cents is null or acquisition_cost_cents >= 0);

alter table clients
  add column if not exists contract_term text
    check (contract_term is null or contract_term in
      ('month_to_month','quarterly','annual','custom'));

alter table clients
  add column if not exists contract_renewal_date date;

alter table clients
  add column if not exists contract_auto_renew boolean default true;

alter table clients
  add column if not exists churn_date date;

alter table clients
  add column if not exists churn_reason text
    check (churn_reason is null or churn_reason in
      ('price','outcome','consolidation','closed_business','paused','other'));

alter table clients
  add column if not exists churn_notes text;

comment on column clients.lead_source is
  'Broad bucket for how the client found Apnosh.';
comment on column clients.lead_source_detail is
  'Free-text specifics — e.g. "Referred by Hong Kong Market" or "AI Builder quiz".';
comment on column clients.referred_by_client_id is
  'If this client was referred by another client, link them. Enables viral-loop analysis.';
comment on column clients.acquisition_cost_cents is
  'Cents spent to acquire this client (ads, referral bonus, meeting time valued, etc.). Null if unknown.';
comment on column clients.contract_renewal_date is
  'Next renewal review date. Even for month-to-month contracts, set a date to force a conversation.';
comment on column clients.churn_reason is
  'Structured reason a client left. Enables pattern recognition across churn.';

create index if not exists idx_clients_renewal_date
  on clients(contract_renewal_date) where contract_renewal_date is not null;

create index if not exists idx_clients_churn_date
  on clients(churn_date) where churn_date is not null;


-- ============================================================
-- 2. client_lifecycle_events
-- ============================================================
-- Signed MRR deltas make expansion / contraction / churn math clean:
--   acquired     +mrr at signup
--   upgraded     +mrr delta
--   downgraded   -mrr delta
--   paused       -mrr (full amount)
--   reactivated  +mrr
--   churned      -mrr (full amount)
--
-- Summing positives vs negatives across a window gives Net Revenue
-- Retention without hand-rolling every time.
-- ============================================================

create table if not exists client_lifecycle_events (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references clients(id) on delete cascade,
  event_type      text not null check (event_type in
                    ('acquired','upgraded','downgraded','paused','reactivated','churned')),
  event_date      date not null default current_date,
  mrr_delta_cents integer not null default 0,
  notes           text,
  created_by      uuid references profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists idx_cle_client_date
  on client_lifecycle_events(client_id, event_date desc);

create index if not exists idx_cle_event_date
  on client_lifecycle_events(event_date desc);

alter table client_lifecycle_events enable row level security;

-- Uses the is_admin() defined back in migration 001. Does not redefine.
create policy "Admins manage lifecycle events"
  on client_lifecycle_events for all
  using (is_admin())
  with check (is_admin());


-- ============================================================
-- 3. business_metrics view
-- ============================================================
-- A single row. One query for the reports dashboard.
-- ============================================================

create or replace view business_metrics as
with
mrr_calc as (
  select coalesce(sum(amount_cents), 0)::bigint as mrr_cents
  from subscriptions
  where status in ('active','trialing')
),
active_clients as (
  select count(*)::int as n
  from clients
  where billing_status = 'active'
),
acquired_30d as (
  select count(*)::int as n
  from clients
  where onboarding_date >= current_date - interval '30 days'
),
churned_30d as (
  select count(*)::int as n
  from clients
  where churn_date >= current_date - interval '30 days'
),
upcoming_renewals as (
  select count(*)::int as n
  from clients
  where contract_renewal_date between current_date and current_date + interval '60 days'
    and billing_status = 'active'
),
top3 as (
  select coalesce(sum(amount_cents), 0)::bigint as top3_mrr_cents
  from (
    select amount_cents
    from subscriptions
    where status in ('active','trialing')
    order by amount_cents desc
    limit 3
  ) t
),
avg_cac as (
  select coalesce(
    avg(acquisition_cost_cents)::bigint,
    0
  ) as avg_cac_cents
  from clients
  where acquisition_cost_cents is not null
    and onboarding_date >= current_date - interval '90 days'
)
select
  active_clients.n            as active_client_count,
  mrr_calc.mrr_cents,
  (mrr_calc.mrr_cents * 12)   as arr_cents,
  acquired_30d.n              as acquired_30d_count,
  churned_30d.n               as churned_30d_count,
  upcoming_renewals.n         as renewals_next_60d,
  case when mrr_calc.mrr_cents > 0
    then round(100.0 * top3.top3_mrr_cents / mrr_calc.mrr_cents, 1)
    else 0
  end                         as top3_share_pct,
  avg_cac.avg_cac_cents       as avg_cac_cents_90d
from mrr_calc, active_clients, acquired_30d, churned_30d, upcoming_renewals, top3, avg_cac;

comment on view business_metrics is
  'Operational snapshot — MRR/ARR, new vs lost clients (30d), upcoming renewals, top-3 concentration, recent avg CAC. One row, built for the reports page.';
