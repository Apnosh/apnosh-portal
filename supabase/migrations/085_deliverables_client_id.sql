-- 085_deliverables_client_id.sql
--
-- Q1 wk 1 — tenancy unblock for 1.1 (service-deliverable spine).
--
-- `deliverables` is the only critical-path table that's still business_id-only.
-- This migration adds a nullable client_id, backfills it via the
-- businesses.client_id bridge, and creates the index. We do NOT mark it
-- NOT NULL yet -- the wk 9 tenancy backfill handles tightening across
-- all legacy tables in one batch.

alter table deliverables
  add column if not exists client_id uuid references clients(id) on delete cascade;

-- Backfill from the bridge. For any deliverable whose business has a
-- linked client, set client_id. Rows without a linked client stay null
-- (legacy Tier 1 self-serve users handled in wk 9 batch migration).
update deliverables d
   set client_id = b.client_id
  from businesses b
 where d.business_id = b.id
   and b.client_id is not null
   and d.client_id is null;

create index if not exists idx_deliverables_client on deliverables(client_id);

-- RLS: add a parallel client-scoped read policy. Existing business-scoped
-- policies remain in force (Tier 1 self-serve clients still rely on them).
-- The wk 9 sweep retires the dual-access pattern across all migrations.
do $$
begin
  if exists (select 1 from pg_policies
              where schemaname='public' and tablename='deliverables'
                and policyname='deliverables_client_select')
  then
    return;
  end if;

  execute $sql$
    create policy deliverables_client_select on deliverables
      for select to authenticated
      using (client_id = current_client_id())
  $sql$;
exception when undefined_function then
  -- current_client_id() helper not present in this environment; skip.
  null;
end $$;
