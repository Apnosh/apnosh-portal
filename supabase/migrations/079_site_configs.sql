-- 079_site_configs.sql
-- Unified Site Builder storage. Single JSONB blob per client matching the
-- vertical's Zod schema (src/lib/site-schemas/*). Draft/published split with
-- full publish history.
--
-- This becomes the single source of truth for what the customer's website
-- renders. Existing tables (client_brands, client_locations,
-- client_content_fields, etc.) remain in place as legacy projections; future
-- migration will populate them from site_configs via triggers.

-- ============================================================================
-- site_configs: one row per client, current draft + last published snapshot
-- ============================================================================

create table if not exists site_configs (
  client_id uuid primary key references clients(id) on delete cascade,
  vertical text not null check (vertical in ('restaurant', 'retail', 'services')),
  template_id text not null default 'restaurant-bold',

  -- Current working state. Auto-saved by Admin Site Builder. Never visible
  -- to public site visitors directly.
  draft_data jsonb not null default '{}'::jsonb,

  -- Last published snapshot. NULL = unpublished. This is what the public
  -- API + customer site templates read.
  published_data jsonb,
  published_at timestamptz,
  published_by uuid references auth.users(id) on delete set null,

  -- Version counter — bumps on every publish. Used by templates for
  -- cache-busting and by deploy hooks for change detection.
  version integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists site_configs_published_idx on site_configs(client_id) where published_data is not null;

comment on table site_configs is
  'Unified site builder config. draft_data is admin working state, published_data is what the public site renders.';

-- ============================================================================
-- site_publish_history: every publish snapshot, for revert + audit
-- ============================================================================

create table if not exists site_publish_history (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  data jsonb not null,
  version integer not null,
  published_at timestamptz not null default now(),
  published_by uuid references auth.users(id) on delete set null,
  notes text
);

create index if not exists site_publish_history_client_idx
  on site_publish_history(client_id, published_at desc);

comment on table site_publish_history is
  'Append-only log of every publish. Used for revert + audit.';

-- ============================================================================
-- updated_at trigger
-- ============================================================================

create or replace function site_configs_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists site_configs_touch_updated_at_trg on site_configs;
create trigger site_configs_touch_updated_at_trg
  before update on site_configs
  for each row execute function site_configs_touch_updated_at();

-- ============================================================================
-- RLS
-- ============================================================================

alter table site_configs enable row level security;
alter table site_publish_history enable row level security;

-- Admins can read/write everything via service role (bypasses RLS).
-- Authenticated client_users can read/write their own client's row.

drop policy if exists "site_configs: admin full access" on site_configs;
create policy "site_configs: admin full access" on site_configs
  for all
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

drop policy if exists "site_configs: client_user read own" on site_configs;
create policy "site_configs: client_user read own" on site_configs
  for select
  using (
    client_id in (
      select client_id from client_users
      where auth_user_id = auth.uid()
    )
  );

drop policy if exists "site_configs: client_user update own" on site_configs;
create policy "site_configs: client_user update own" on site_configs
  for update
  using (
    client_id in (
      select client_id from client_users
      where auth_user_id = auth.uid()
    )
  );

drop policy if exists "site_publish_history: admin read" on site_publish_history;
create policy "site_publish_history: admin read" on site_publish_history
  for select
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

drop policy if exists "site_publish_history: client_user read own" on site_publish_history;
create policy "site_publish_history: client_user read own" on site_publish_history
  for select
  using (
    client_id in (
      select client_id from client_users
      where auth_user_id = auth.uid()
    )
  );
