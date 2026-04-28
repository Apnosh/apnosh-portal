-- ============================================================
-- Migration 071: Unified updates system
-- ============================================================
-- Restaurants make hundreds of operational changes per year:
-- update hours, add a menu item, run a promotion, host an event,
-- close for a holiday. Each change needs to propagate to GBP, Yelp,
-- Facebook, Instagram, the restaurant's website, email subscribers.
--
-- This migration introduces the unified Update entity. Every change
-- type (hours, menu_item, promotion, event, closure, asset, info)
-- flows through the same data structure with a per-platform fanout
-- tracker. The killer demo: "Manager changes hours once → 7 places
-- updated in 30 seconds."
--
-- Source of truth lives on the entity that owns it (gbp_locations
-- for hours, future menu_items table for menu, etc). The updates
-- table is the EVENT log + fanout coordinator, not the canonical
-- state.
-- ============================================================

-- ── Source of truth: hours on gbp_locations ──────────────────
-- Regular weekly hours: { mon: [{open, close}, ...], tue: ..., }
-- Multiple ranges per day support split shifts (lunch + dinner)
alter table gbp_locations
  add column if not exists hours jsonb,
  add column if not exists special_hours jsonb not null default '[]'::jsonb;

comment on column gbp_locations.hours is
  'Regular weekly hours. JSON: { mon: [{open: "09:00", close: "22:00"}], tue: ..., sun: [] }. Empty array = closed that day.';
comment on column gbp_locations.special_hours is
  'Holiday/special hours overrides. JSON array: [{ date: "2026-12-24", hours: [{open, close}] | [], note }]';

-- ── The unified updates table ─────────────────────────────────
create table if not exists updates (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  -- nullable: when null, applies to all locations of the client
  location_id uuid references gbp_locations(id) on delete cascade,

  type text not null check (type in (
    'hours', 'menu_item', 'promotion', 'event', 'closure', 'asset', 'info'
  )),

  -- Type-specific data. See payload schema docs in src/lib/updates/types.ts
  payload jsonb not null,

  -- Lifecycle
  status text not null default 'draft' check (status in (
    'draft', 'review', 'scheduled', 'publishing', 'published', 'failed', 'cancelled'
  )),

  -- Where this update should propagate to
  targets text[] not null default '{}',
  scheduled_for timestamptz,

  -- Approval workflow (some clients want owner approval, some auto-publish)
  approval_required boolean not null default false,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,

  -- Audit
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,

  -- Optional human-readable label for the update
  summary text,

  -- Provenance: was this manual, API-driven, or scheduled?
  source text not null default 'manual' check (source in (
    'manual', 'api', 'cron', 'auto'
  ))
);

create index if not exists idx_updates_client_status on updates(client_id, status);
create index if not exists idx_updates_location on updates(location_id) where location_id is not null;
create index if not exists idx_updates_scheduled on updates(scheduled_for) where status = 'scheduled';
create index if not exists idx_updates_type_created on updates(type, created_at desc);

-- ── Per-platform fanout tracking ──────────────────────────────
create table if not exists update_fanouts (
  id uuid primary key default gen_random_uuid(),
  update_id uuid not null references updates(id) on delete cascade,
  target text not null check (target in (
    'gbp', 'yelp', 'facebook', 'instagram', 'website', 'email', 'sms', 'pos'
  )),

  status text not null default 'pending' check (status in (
    'pending', 'in_progress', 'success', 'failed', 'skipped', 'rate_limited'
  )),

  -- The platform-specific payload that was (or will be) sent
  payload jsonb,

  -- Result tracking
  external_id text,
  external_url text,
  error_message text,
  retry_count int not null default 0,
  next_retry_at timestamptz,

  attempted_at timestamptz,
  completed_at timestamptz,

  unique(update_id, target)
);

create index if not exists idx_update_fanouts_status on update_fanouts(status);
create index if not exists idx_update_fanouts_pending on update_fanouts(status, next_retry_at)
  where status in ('pending', 'rate_limited', 'failed');

-- ── Auto-update updated_at on updates table ───────────────────
create or replace function updates_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_updates_updated_at on updates;
create trigger trg_updates_updated_at
  before update on updates
  for each row execute function updates_set_updated_at();

-- ── RLS ───────────────────────────────────────────────────────
alter table updates enable row level security;
alter table update_fanouts enable row level security;

do $$ begin
  create policy "admins manage updates"
    on updates for all
    using (is_admin())
    with check (is_admin());
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "clients read their updates"
    on updates for select
    using (
      client_id in (
        select client_id from client_users where auth_user_id = auth.uid()
      )
    );
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "admins manage update_fanouts"
    on update_fanouts for all
    using (is_admin())
    with check (is_admin());
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "clients read their update_fanouts"
    on update_fanouts for select
    using (
      update_id in (
        select id from updates where client_id in (
          select client_id from client_users where auth_user_id = auth.uid()
        )
      )
    );
exception when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
