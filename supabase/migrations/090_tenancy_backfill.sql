-- 089_tenancy_backfill.sql
--
-- Q1 wk 9 -- tenancy backfill phase one (Phase 3 Decision 1).
--
-- Two jobs:
--
-- 1. Tier 1 self-serve users: every `businesses` row without a linked
--    clients row gets one auto-created (so all owner-id users are
--    addressable as Tier 2 clients in the portal). The owner's
--    auth.users.id is mapped via client_users.auth_user_id.
--
-- 2. brand_guidelines.client_id added (nullable, backfilled via the
--    bridge). Sets up Q2 wk 6 brand-merge work.
--
-- Idempotent: re-running this migration is a no-op once the data has
-- landed (NOT EXISTS guards on inserts, IF NOT EXISTS on schema).

-- ── 1. Tier 1 backfill ───────────────────────────────────────────

-- For every business without a linked client, create one. We pull the
-- owner's email + full_name from profiles since businesses doesn't
-- carry contact columns directly.
with new_clients as (
  insert into clients (id, name, slug, primary_contact, email, status, created_at)
  select
    gen_random_uuid(),
    b.name,
    -- Slug derived from business name; disambiguate against existing slugs.
    case
      when exists (
        select 1 from clients c
        where c.slug = lower(regexp_replace(b.name, '[^a-zA-Z0-9]+', '-', 'g'))
      )
      then lower(regexp_replace(b.name, '[^a-zA-Z0-9]+', '-', 'g'))
           || '-' || substr(b.id::text, 1, 6)
      else lower(regexp_replace(b.name, '[^a-zA-Z0-9]+', '-', 'g'))
    end,
    p.full_name,
    p.email,
    'active',
    b.created_at
  from businesses b
  join profiles p on p.id = b.owner_id
  where b.client_id is null
  returning id, email, created_at
)
select 1; -- CTE side-effect

-- Link each business to the client we just created (matched on the
-- owner's email since that's the disambiguator).
update businesses b
   set client_id = c.id
  from clients c
  join profiles p on p.email = c.email
 where b.client_id is null
   and b.owner_id = p.id;

-- Map the business owner to the new client via client_users.
-- profiles.id IS auth.users.id, so we can use it directly.
insert into client_users (
  client_id, email, name, role, status, auth_user_id, invited_at
)
select
  b.client_id,
  p.email,
  p.full_name,
  'owner',
  'active',
  p.id,
  b.created_at
from businesses b
join profiles p on p.id = b.owner_id
where b.client_id is not null
  and not exists (
    select 1 from client_users cu
    where cu.client_id = b.client_id
      and (cu.auth_user_id = p.id or cu.email = p.email)
  );

-- ── 2. brand_guidelines.client_id ────────────────────────────────

alter table brand_guidelines
  add column if not exists client_id uuid references clients(id) on delete cascade;

update brand_guidelines bg
   set client_id = b.client_id
  from businesses b
 where bg.business_id = b.id
   and b.client_id is not null
   and bg.client_id is null;

create index if not exists idx_brand_guidelines_client on brand_guidelines(client_id);

-- ── 3. Mark legacy columns deprecated (comments only -- no breakage) ─

comment on column businesses.owner_id is
  'DEPRECATED: legacy Tier 1 self-serve. Use clients + client_users '
  '(path: businesses.client_id -> client_users.auth_user_id). Removal Q4.';

comment on column brand_guidelines.business_id is
  'DEPRECATED: see client_id. Removal Q4.';
