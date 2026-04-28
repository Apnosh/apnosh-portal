-- ============================================================
-- Migration 069: gbp_locations as a first-class entity
-- ============================================================
-- Until now, gbp_metrics keyed off (client_id, location_name) and
-- the backfill matcher tried to fuzzy-match Google's "Business Name"
-- against clients.name. Names drift, multi-location clients (Do Si
-- KBBQ has 2, IJ Sushi has 7) are awkward, and every CSV upload
-- re-runs the same brittle guess.
--
-- This migration introduces gbp_locations: one row per GBP listing,
-- keyed by Google's stable store_code. The admin claims a location
-- once; every future CSV or API ingest routes deterministically.
-- This matches how the Google Business Profile Performance API
-- returns data (location IDs, not names), so when our API quota is
-- approved the cron path slots in without schema changes.
-- ============================================================

create table if not exists gbp_locations (
  id            uuid primary key default gen_random_uuid(),
  -- nullable: a location can exist in 'unassigned' or 'skipped' state
  -- before/without being tied to a client.
  client_id     uuid references clients(id) on delete set null,
  -- Google's stable ID. Globally unique. From CSV "Store code"
  -- column or, eventually, the API's locations.name path segment.
  store_code    text not null unique,
  -- Last-seen display name (kept for UI; not authoritative).
  location_name text not null,
  address       text,
  -- 'unassigned' = needs admin to claim (or skip)
  -- 'assigned'   = client_id set, future imports route here
  -- 'skipped'    = admin marked "not my client", silently ignored forever
  status        text not null default 'unassigned'
                 check (status in ('unassigned', 'assigned', 'skipped')),
  -- Bookkeeping for the admin UI ("first seen 3 months ago in
  -- backfill_2026_01.csv").
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_gbp_locations_client on gbp_locations(client_id) where client_id is not null;
create index if not exists idx_gbp_locations_status on gbp_locations(status);

comment on table  gbp_locations         is 'One row per Google Business Profile listing. Stable store_code is the source of truth; names can drift.';
comment on column gbp_locations.status  is 'unassigned (needs admin claim) | assigned (routes to client_id) | skipped (ignored on import)';

-- ── Constraint: assigned locations must have a client_id ──
alter table gbp_locations
  add constraint gbp_locations_assigned_has_client
  check ((status = 'assigned' and client_id is not null) or status <> 'assigned');

-- ============================================================
-- gbp_metrics: link to gbp_locations
-- ============================================================
-- Keep client_id on gbp_metrics (denormalized) so existing dashboard
-- queries don't need to join. We populate it from the location's
-- client_id at insert time -- a trigger enforces the invariant.
-- ============================================================

alter table gbp_metrics
  add column if not exists gbp_location_id uuid references gbp_locations(id) on delete cascade;

create index if not exists idx_gbp_metrics_location on gbp_metrics(gbp_location_id);

-- New uniqueness: one row per (location, date). The legacy
-- (client_id, location_id, date) unique constraint stays as-is for
-- backwards compat with rows that don't yet have a gbp_location_id;
-- new rows we write will have both.
-- Full unique constraint (not partial) so ON CONFLICT (gbp_location_id, date)
-- works via PostgREST upsert. Postgres treats NULLs as distinct by default,
-- so legacy rows without a location_id don't conflict.
do $$ begin
  alter table gbp_metrics
    add constraint uq_gbp_metrics_location_date
    unique (gbp_location_id, date);
exception when duplicate_object then null;
end $$;

-- ============================================================
-- Trigger: keep gbp_metrics.client_id in sync with location's client
-- ============================================================
create or replace function gbp_metrics_sync_client_id()
returns trigger
language plpgsql
as $$
begin
  if new.gbp_location_id is not null then
    select client_id into new.client_id
      from gbp_locations
      where id = new.gbp_location_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_gbp_metrics_sync_client on gbp_metrics;
create trigger trg_gbp_metrics_sync_client
  before insert or update of gbp_location_id on gbp_metrics
  for each row execute function gbp_metrics_sync_client_id();

-- ============================================================
-- RLS: clients see only their own locations; admins see all
-- ============================================================
alter table gbp_locations enable row level security;

do $$ begin
  create policy "admins manage gbp_locations"
    on gbp_locations for all
    using (is_admin())
    with check (is_admin());
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "clients read their gbp_locations"
    on gbp_locations for select
    using (
      client_id in (
        select client_id from client_users where auth_user_id = auth.uid()
      )
    );
exception when duplicate_object then null;
end $$;

-- ============================================================
-- Reload PostgREST schema cache
-- ============================================================
notify pgrst, 'reload schema';
