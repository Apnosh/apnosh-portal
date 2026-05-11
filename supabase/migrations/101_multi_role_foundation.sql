-- ─────────────────────────────────────────────────────────────
-- 101_multi_role_foundation.sql
--
-- Phase 0 of the multi-role architecture (see plan doc).
--
-- Today every person in the system is exactly one of: admin, or
-- a single client_user / business owner. That model has carried us
-- to ~14 clients. To scale to 10K we need to support:
--   - one person wearing many hats (strategist + videographer)
--   - a contractor pool that isn't pre-attached to a client
--   - role-scoped permissions checked from a single source of truth
--
-- This migration is purely additive. Nothing existing is dropped or
-- renamed. The old paths (profiles.role, client_users, businesses)
-- keep working; the new tables shadow them and get used by new
-- surfaces (/work/*, the workspace switcher, the marketplace).
--
-- A separate follow-up migration will backfill from the old tables.
-- ─────────────────────────────────────────────────────────────

-- ── 1. Capability enum: every "hat" anyone in the system can wear.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'role_capability') then
    create type role_capability as enum (
      'admin',
      'strategist',
      'ad_buyer',
      'community_mgr',
      'editor',
      'copywriter',
      'videographer',
      'photographer',
      'influencer',
      'client_owner',
      'client_manager'
    );
  end if;
end$$;

-- ── 2. person_capabilities: what this human CAN do, regardless of
--    which client they're working on right now.
create table if not exists person_capabilities (
  id           uuid primary key default gen_random_uuid(),
  person_id    uuid not null references auth.users(id) on delete cascade,
  capability   role_capability not null,
  status       text not null default 'active'
                 check (status in ('active','paused','offboarded')),
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (person_id, capability)
);

create index if not exists person_capabilities_person_idx
  on person_capabilities (person_id) where status = 'active';
create index if not exists person_capabilities_cap_idx
  on person_capabilities (capability) where status = 'active';

-- ── 3. role_assignments: what they ARE doing right now. Optional
--    client_id — null means pool/marketplace (eg. a videographer
--    on the bench waiting for a shoot).
create table if not exists role_assignments (
  id            uuid primary key default gen_random_uuid(),
  person_id     uuid not null references auth.users(id) on delete cascade,
  client_id     uuid references clients(id) on delete cascade,
  role          role_capability not null,
  scope         text not null default 'client'
                  check (scope in ('global','client','marketplace')),
  assigned_by   uuid references auth.users(id),
  assigned_at   timestamptz not null default now(),
  ended_at      timestamptz,
  agreement_id  uuid,
  notes         text,
  -- A person can hold the same role for the same client only once at a
  -- time. Null client_id means pool — many pool rows allowed only if
  -- the role differs.
  unique (person_id, client_id, role)
);

create index if not exists role_assignments_person_idx
  on role_assignments (person_id) where ended_at is null;
create index if not exists role_assignments_client_idx
  on role_assignments (client_id, role) where ended_at is null;
create index if not exists role_assignments_pool_idx
  on role_assignments (role) where client_id is null and ended_at is null;

-- ── 4. Helpers used by RLS and server code.

-- Does the current user have this capability anywhere?
create or replace function public.has_capability(cap role_capability)
returns boolean as $$
  select exists (
    select 1 from person_capabilities
    where person_id = auth.uid()
      and capability = cap
      and status = 'active'
  );
$$ language sql security definer stable;

-- Is the current user assigned to this client in this role?
create or replace function public.is_assigned(target_client uuid, target_role role_capability)
returns boolean as $$
  select exists (
    select 1 from role_assignments
    where person_id = auth.uid()
      and client_id = target_client
      and role = target_role
      and ended_at is null
  );
$$ language sql security definer stable;

-- All client ids this user has ANY active role on. Useful for staff
-- who service many clients (strategist, editor, ad_buyer).
create or replace function public.assigned_client_ids()
returns setof uuid as $$
  select distinct client_id from role_assignments
  where person_id = auth.uid()
    and ended_at is null
    and client_id is not null;
$$ language sql security definer stable;

-- The set of roles this user currently has active anywhere. Used by
-- the workspace switcher to render the role chooser.
create or replace function public.active_roles_for_me()
returns setof role_capability as $$
  select distinct capability from person_capabilities
  where person_id = auth.uid()
    and status = 'active';
$$ language sql security definer stable;

comment on table person_capabilities is
  'What hats a person CAN wear. One row per (person, capability). Status flips to ''offboarded'' to revoke without losing history.';
comment on table role_assignments is
  'What hats a person IS wearing right now. Optional client_id — null means pool/marketplace bench.';
comment on function has_capability is
  'Phase-0 permission helper. Returns true if the current auth user has this capability active.';
comment on function is_assigned is
  'Phase-0 permission helper. Returns true if the current auth user is assigned to (client, role) and not ended.';

-- ── 5. RLS on the new tables. Person sees their own rows. Admins
--    see everything.
alter table person_capabilities enable row level security;
alter table role_assignments    enable row level security;

drop policy if exists "self read capabilities"      on person_capabilities;
drop policy if exists "admin all capabilities"      on person_capabilities;
drop policy if exists "self read assignments"       on role_assignments;
drop policy if exists "admin all assignments"       on role_assignments;

create policy "self read capabilities"
  on person_capabilities for select
  using (person_id = auth.uid());
create policy "admin all capabilities"
  on person_capabilities for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "self read assignments"
  on role_assignments for select
  using (person_id = auth.uid());
create policy "admin all assignments"
  on role_assignments for all
  using (public.is_admin())
  with check (public.is_admin());
