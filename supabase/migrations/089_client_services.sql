-- 089_client_services.sql
--
-- The Tier 2 service subscription per client. Migration 086 referenced
-- this table for the requires_client_approval column; this migration
-- introduces it as a first-class entity.
--
-- One row per (client, service_slug) that's currently or historically
-- active. The wk 11 service-tracking surface uses this to render
-- "delivered vs expected this month" per service.
--
-- Service slugs match service_expectations.service_slug (Q1 wk 10
-- migration). Strings rather than FK so service_catalog (Tier 1) and
-- the Tier 2 service set can evolve independently.

create table if not exists client_services (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,

  -- Stable slug; see service_expectations for the canonical list.
  service_slug text not null,

  -- Display + commerce metadata. Free-form -- the catalog is small.
  display_name text,
  monthly_price_cents integer,
  status text not null default 'active'
    check (status in ('active', 'paused', 'canceled')),

  -- Trust-mode toggle: when false, posts under this service must
  -- transition through in_review -> approved before scheduling.
  requires_client_approval boolean not null default true,

  started_at timestamptz not null default now(),
  ended_at timestamptz,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists client_services_unique_active
  on client_services(client_id, service_slug)
  where status = 'active';

create index if not exists idx_client_services_client
  on client_services(client_id, status);

alter table client_services enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public'
      and tablename='client_services' and policyname='Admins manage client_services'
  ) then
    create policy "Admins manage client_services"
      on client_services for all using (is_admin());
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public'
      and tablename='client_services' and policyname='Client reads own services'
  ) then
    create policy "Client reads own services"
      on client_services for select using (client_id = current_client_id());
  end if;
end $$;

comment on table client_services is
  'Per-client Tier 2 service subscription. service_slug matches '
  'service_expectations.service_slug for delivery-tracking joins.';
