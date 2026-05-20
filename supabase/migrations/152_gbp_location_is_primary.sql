-- Reconcile schema with code: gbp_locations.is_primary
--
-- The app types (src/types/database.ts) and several queries assume a
-- gbp_locations.is_primary column, but the table never had it. Queries
-- that ordered by it errored silently and returned no rows, which is why
-- a client's local presence (business-info, locations) intermittently
-- showed blank. The application code was patched to fall back to
-- created_at, but adding the real column prevents this whole class of
-- bug from recurring elsewhere.
--
-- Backfill marks the earliest location per client as primary, and a
-- partial unique index guarantees at most one primary per client.

alter table gbp_locations
  add column if not exists is_primary boolean not null default false;

comment on column gbp_locations.is_primary is
  'Whether this is the client''s primary location. At most one per client (see partial unique index).';

-- Backfill: earliest location per client becomes primary, but only when
-- the client has no primary yet (idempotent on re-run).
with ranked as (
  select id,
         row_number() over (partition by client_id order by created_at asc, id asc) as rn
  from gbp_locations
)
update gbp_locations g
set is_primary = true
from ranked r
where g.id = r.id
  and r.rn = 1
  and not exists (
    select 1 from gbp_locations g2
    where g2.client_id = g.client_id
      and g2.is_primary = true
  );

-- Enforce at most one primary per client.
create unique index if not exists gbp_locations_one_primary_per_client
  on gbp_locations (client_id)
  where is_primary;
