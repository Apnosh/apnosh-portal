-- ============================================================
-- Migration 056: CRM interactions log (event-sourced)
-- ============================================================
-- Append-only event log of every substantive interaction with a client:
-- calls, meetings, emails, notes, status changes, contract renewals.
-- Powers the client detail page's activity timeline AND provides
-- structured data for future ML models (engagement signals,
-- satisfaction proxies, churn prediction).
--
-- Event-sourced vs state-only:
--   - We append every interaction; rows are never mutated once written
--   - The client_activity_log table (from migration 002) is kept as a
--     coarse-grained feed; this new table is the high-fidelity record
--   - Reductions (e.g. "last contact date", "call count last 30 days")
--     are queried at read time, not precomputed
--
-- What we explicitly DO store:
--   - Who, what, when, and outcome for every interaction
--   - Free-form notes and optional structured metadata
--   - Sentiment / satisfaction signals when the admin captures them
--   - Contract / renewal events
--
-- What we explicitly DO NOT store here:
--   - Routine CRUD (edits to notes, profile fields) -- those are
--     state-only on the existing tables
--   - Financial events (invoices, subscriptions) -- already fully
--     represented in the billing v2 tables
-- ============================================================

create table client_interactions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,

  -- Who performed / logged the interaction (admin user, or null for
  -- system-generated events like 'imported from Notion').
  performed_by uuid references profiles(id) on delete set null,
  performed_by_name text,  -- denormalized snapshot (in case profile is deleted)

  -- High-level bucketing. Extendable via the next column.
  kind text not null check (kind in (
    'call', 'meeting', 'email', 'text', 'note',
    'status_change', 'contract_signed', 'contract_renewed', 'contract_ended',
    'onboarding_milestone', 'review_requested', 'review_received',
    'complaint', 'compliment', 'win', 'issue',
    'imported', 'other'
  )),
  -- Free-form subtype/label for categorization beyond 'kind'.
  subtype text,

  -- When did the thing actually happen (not when it was logged -- those
  -- can differ if admin back-fills a meeting from last week).
  occurred_at timestamptz not null default now(),

  -- Main content fields.
  summary text,            -- 1-line description shown on timeline
  body text,               -- longer notes, meeting minutes, etc.
  outcome text,             -- 'resolved', 'escalated', 'follow-up needed', free-form

  -- Optional satisfaction signals for ML / churn risk.
  sentiment text check (sentiment in ('positive', 'neutral', 'negative') or sentiment is null),
  satisfaction_score int check (satisfaction_score between 0 and 10),  -- NPS-style 0-10

  -- For calls/meetings: how long did it run?
  duration_minutes int check (duration_minutes is null or duration_minutes >= 0),

  -- Structured metadata catchall. Schema evolves without a migration.
  -- Example: { "channel": "phone", "participants": ["Mark", "Maria"], "topic": "Q2 renewal" }
  metadata jsonb not null default '{}',

  -- Soft-structure extras
  tags text[] not null default '{}',

  created_at timestamptz not null default now()
);

create index idx_client_interactions_client_occurred on client_interactions(client_id, occurred_at desc);
create index idx_client_interactions_kind on client_interactions(kind);
create index idx_client_interactions_tags on client_interactions using gin(tags);
create index idx_client_interactions_sentiment on client_interactions(sentiment) where sentiment is not null;


-- ============================================================
-- Derived read-model: most-recent interaction per client.
-- Useful for the clients list page to show "last contact" without
-- a full subquery every time.
-- ============================================================
create view v_client_last_contact as
select distinct on (client_id)
  client_id,
  occurred_at as last_contact_at,
  kind as last_contact_kind,
  summary as last_contact_summary
from client_interactions
order by client_id, occurred_at desc;


-- ============================================================
-- RLS
-- ============================================================
alter table client_interactions enable row level security;

-- Admin full access (via profiles.role = 'admin'). Service role
-- bypasses RLS entirely for background jobs + webhooks.
create policy "admin full access on client_interactions"
  on client_interactions for all
  to authenticated
  using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  )
  with check (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- Clients can read interactions tagged to their own record (read-only --
-- they can't edit or insert; admin logs them).
create policy "client reads own interactions"
  on client_interactions for select
  to authenticated
  using (
    client_id in (
      select client_id from client_users
      where auth_user_id = auth.uid()
    )
  );


-- ============================================================
-- Seed: bootstrap an 'imported' event for every existing client so
-- the activity timeline has a starting point.
-- ============================================================
insert into client_interactions (client_id, kind, subtype, occurred_at, summary, performed_by_name, metadata)
select
  c.id,
  'imported',
  'bootstrap',
  coalesce(c.onboarding_date::timestamptz, c.created_at),
  'Client record created',
  'system',
  jsonb_build_object('source', 'pre_migration_056')
from clients c;


-- ============================================================
-- Done.
-- Apply via the Supabase SQL editor or management API.
-- ============================================================
