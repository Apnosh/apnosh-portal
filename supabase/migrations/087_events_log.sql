-- 087_events_log.sql
--
-- Q1 wk 4 -- unified events log (Phase 3 Decision 2).
--
-- Polymorphic, append-only audit feed. Every meaningful change in the
-- portal writes one row here. The strategist console (1.3) reads from
-- this single table instead of unioning 4+ per-feature audit tables.
--
-- Existing tables (client_interactions, scheduled_posts_history,
-- bespoke_handoff_events, etc.) remain authoritative for their domains;
-- this is the *summary* feed. Ingest via the logEvent() helper or via
-- triggers that mirror domain events.
--
-- Schema design notes:
--   - subject_type / subject_id let us link a row back to its primary
--     domain object (e.g. subject_type='scheduled_post').
--   - actor_id / actor_role separated -- some events come from cron
--     ('system') or callbacks ('webhook').
--   - payload jsonb is intentionally loose; per-event_type Zod schemas
--     live in src/lib/events/schemas.ts.

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,

  event_type text not null,            -- e.g. 'scheduled_post.approved'
  subject_type text,                   -- e.g. 'scheduled_post'
  subject_id uuid,                     -- the row this event is about

  actor_id uuid references auth.users(id) on delete set null,
  actor_role text,                     -- 'admin' | 'strategist' | 'client' | 'system' | 'cron' | 'webhook'

  payload jsonb not null default '{}',
  summary text,                        -- pre-computed human line for fast feeds

  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists events_client_recent_idx
  on events(client_id, occurred_at desc);
create index if not exists events_type_idx
  on events(event_type, occurred_at desc);
create index if not exists events_subject_idx
  on events(subject_type, subject_id, occurred_at desc);

alter table events enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public'
      and tablename='events' and policyname='Admins read events'
  ) then
    create policy "Admins read events"
      on events for select using (is_admin());
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public'
      and tablename='events' and policyname='Client reads own events'
  ) then
    create policy "Client reads own events"
      on events for select using (client_id = current_client_id());
  end if;
end $$;

-- ── Backfill from client_interactions (one-shot) ─────────────────
-- This is the largest existing event source. We map kind+subtype to
-- event_type, copy actor and timestamps, and capture the original row's
-- id in payload.original_interaction_id for traceability.
insert into events(
  client_id, event_type, subject_type, subject_id,
  actor_id, actor_role, payload, summary, occurred_at, created_at
)
select
  ci.client_id,
  'crm.' || ci.kind || coalesce('.' || ci.subtype, '') as event_type,
  'client_interaction' as subject_type,
  ci.id as subject_id,
  ci.performed_by as actor_id,
  case when ci.performed_by is not null then 'admin' else 'system' end as actor_role,
  jsonb_build_object(
    'kind', ci.kind,
    'subtype', ci.subtype,
    'original_interaction_id', ci.id
  ) as payload,
  ci.summary,
  ci.occurred_at,
  coalesce(ci.created_at, ci.occurred_at)
from client_interactions ci
where not exists (
  select 1 from events e
  where e.subject_type = 'client_interaction' and e.subject_id = ci.id
)
on conflict do nothing;

comment on table events is
  'Unified event log. Phase 3 Decision 2 (Q1 wk 4). Polymorphic, '
  'append-only. Strategist console + AI summaries read from here.';
