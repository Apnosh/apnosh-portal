-- 084_state_transitions.sql
--
-- Generic workflow state machine. Q1 architecture decision #5.
--
-- The portal will have 5+ workflowed entities in 2026 (scheduled_posts,
-- deliverables, paid_campaigns, email_sends, audience_syncs, generated
-- reports). Rather than hand-rolling state checks per table, this migration
-- introduces one pattern reused everywhere:
--
--   1. state_transitions table  -- declares the allowed (from, to) edges
--      per entity_type, with an optional capability gate.
--
--   2. enforce_state_transition() trigger function  -- generic; call
--      `create trigger ... on <table> ... execute function
--      enforce_state_transition('<entity_type>', '<status_column>')`
--      to wire any table into the machine.
--
--   3. App-layer helper transition(entity, to, actor) (in TypeScript)
--      writes through to events table once that lands (next migration).
--
-- Inserts that set the initial state are always allowed (from-state is null).
-- Updates that don't change the state column are no-ops for this trigger.
-- Updates that move state require an entry in state_transitions or fail.

create table if not exists state_transitions (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,                        -- e.g. 'scheduled_post'
  from_state text,                                  -- null = initial insert
  to_state text not null,
  requires_capability text,                         -- e.g. 'scheduled_posts.publish'; null = any actor
  description text,                                 -- human note for the matrix doc
  created_at timestamptz not null default now()
);

create unique index if not exists state_transitions_unique_edge
  on state_transitions(entity_type, coalesce(from_state, ''), to_state);

create index if not exists state_transitions_entity_idx
  on state_transitions(entity_type);

-- Generic enforcement trigger.
-- TG_ARGV[0] = entity_type (matches state_transitions.entity_type)
-- TG_ARGV[1] = column name on the table that holds the state (default 'status')
create or replace function enforce_state_transition()
returns trigger
language plpgsql
as $$
declare
  v_entity_type text := tg_argv[0];
  v_column text := coalesce(tg_argv[1], 'status');
  v_old_state text;
  v_new_state text;
  v_allowed boolean;
begin
  -- Pull old/new state by column name. Uses jsonb because we're generic.
  if tg_op = 'INSERT' then
    v_old_state := null;
    v_new_state := (to_jsonb(new) ->> v_column);
  elsif tg_op = 'UPDATE' then
    v_old_state := (to_jsonb(old) ->> v_column);
    v_new_state := (to_jsonb(new) ->> v_column);
    -- Not a state change -- skip enforcement
    if v_old_state is not distinct from v_new_state then
      return new;
    end if;
  else
    return new;
  end if;

  -- Allow null/empty initial states (some tables let drafts have no state)
  if v_new_state is null then
    return new;
  end if;

  select exists(
    select 1 from state_transitions
    where entity_type = v_entity_type
      and (from_state is not distinct from v_old_state)
      and to_state = v_new_state
  ) into v_allowed;

  if not v_allowed then
    raise exception
      'Invalid state transition for %: % -> % (table=%, column=%)',
      v_entity_type,
      coalesce(v_old_state, '<initial>'),
      v_new_state,
      tg_table_name,
      v_column
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function enforce_state_transition() is
  'Generic state-machine guard. Wire per-table with: create trigger ... '
  'before insert or update on <table> for each row execute function '
  'enforce_state_transition(''<entity_type>'', ''<status_column>'').';

-- No seeds yet. Per-entity state matrices ship with the migration that
-- wires each entity's trigger:
--   - scheduled_post   (Q1 wk 3, 1.4)
--   - deliverable      (Q1 wk 10, 1.1)
--   - paid_campaign    (Q2)
--   - email_send       (Q2)
--   - audience_sync    (Q3)
--   - generated_report (Q4)
-- Keeping seeds with their consumers keeps the migration history honest:
-- you can always tell which release introduced an entity's state machine.
