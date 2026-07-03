-- GBP write ledger — the durable backbone for two guarantees the apply-engine makes when it writes
-- to a client's LIVE Google profile:
--   1. PACE: Google caps profile edits at 10/min/profile and the cap cannot be raised. The in-memory
--      token bucket in gbp-apply/dispatch.ts is per server instance, so under serverless concurrency
--      it cannot enforce a global cap. gbp_acquire_write_slot() is the shared, atomic source of truth:
--      an advisory transaction lock per location serializes the check-and-append, so N concurrent
--      instances can never jointly exceed the window.
--   2. AUDIT: an append-only row per acquired slot doubles as the write ledger (who, which location,
--      when), independent of the mutable work-order step jsonb.
-- The engine calls the RPC and falls back to the in-memory bucket only when this migration is not yet
-- applied, so applying it flips durability on with no code change.

create table if not exists gbp_write_ledger (
  id uuid primary key default gen_random_uuid(),
  location_key text not null,           -- the GBP location resource (accounts/{a}/locations/{l})
  acquired_at timestamptz not null default now()
);
create index if not exists gbp_write_ledger_loc_time on gbp_write_ledger (location_key, acquired_at desc);

alter table gbp_write_ledger enable row level security;
-- Server-role only; no client policies. (Service role bypasses RLS; authenticated users get nothing.)

-- Atomic acquire: true = slot granted (row appended), false = the window is full, do not write.
create or replace function gbp_acquire_write_slot(p_location text, p_limit int default 10, p_window_secs int default 60)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  used int;
begin
  -- Serialize per location for the duration of this transaction.
  perform pg_advisory_xact_lock(hashtext(p_location));
  select count(*) into used
    from gbp_write_ledger
   where location_key = p_location
     and acquired_at > now() - make_interval(secs => p_window_secs);
  if used >= p_limit then
    return false;
  end if;
  insert into gbp_write_ledger (location_key) values (p_location);
  return true;
end;
$$;

-- Lock the function down to the service role.
revoke all on function gbp_acquire_write_slot(text, int, int) from public;
