-- ─────────────────────────────────────────────────────────────
-- 102_backfill_multi_role.sql
--
-- Seeds person_capabilities + role_assignments from the legacy
-- tables so the switcher renders meaningfully the moment 101 ships.
--
-- Mapping:
--   profiles.role = 'admin'    -> capability 'admin', no client_id
--   businesses.owner_id        -> capability 'client_owner', client_id
--   client_users.auth_user_id  -> capability 'client_manager', client_id
--
-- Idempotent: all inserts use on conflict do nothing against the
-- natural unique keys we declared in 101.
-- ─────────────────────────────────────────────────────────────

-- 1) Admins
insert into person_capabilities (person_id, capability, status)
select id, 'admin'::role_capability, 'active'
from profiles
where role = 'admin'
on conflict (person_id, capability) do nothing;

insert into role_assignments (person_id, client_id, role, scope, assigned_at)
select id, null, 'admin'::role_capability, 'global', now()
from profiles
where role = 'admin'
on conflict (person_id, client_id, role) do nothing;

-- 2) Business owners -> client_owner
insert into person_capabilities (person_id, capability, status)
select distinct owner_id, 'client_owner'::role_capability, 'active'
from businesses
where owner_id is not null
on conflict (person_id, capability) do nothing;

insert into role_assignments (person_id, client_id, role, scope, assigned_at)
select b.owner_id, b.client_id, 'client_owner'::role_capability, 'client', now()
from businesses b
where b.owner_id is not null and b.client_id is not null
on conflict (person_id, client_id, role) do nothing;

-- 3) Client users -> client_manager (default; a single-seat client
--    will likely also have the same person as client_owner above —
--    that's fine, two distinct rows.)
insert into person_capabilities (person_id, capability, status)
select distinct auth_user_id, 'client_manager'::role_capability, 'active'
from client_users
where auth_user_id is not null
on conflict (person_id, capability) do nothing;

insert into role_assignments (person_id, client_id, role, scope, assigned_at)
select cu.auth_user_id, cu.client_id, 'client_manager'::role_capability, 'client', now()
from client_users cu
where cu.auth_user_id is not null and cu.client_id is not null
on conflict (person_id, client_id, role) do nothing;

-- Sanity counts (visible in Studio output, not enforced)
do $$
declare
  cap_count int;
  asn_count int;
begin
  select count(*) into cap_count from person_capabilities;
  select count(*) into asn_count from role_assignments;
  raise notice 'person_capabilities: %, role_assignments: %', cap_count, asn_count;
end$$;
