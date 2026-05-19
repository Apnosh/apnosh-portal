-- Audit runs: stores per-client Apnosh Score + finding details.
--
-- One row per audit invocation. Findings stored as jsonb so the
-- check catalog can evolve without schema migrations. Score history
-- enables "your score went from 38 to 47 this week" trend lines.

create table if not exists audit_runs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  ran_at timestamptz not null default now(),

  -- Aggregated scores (0-100 each)
  score_overall int not null,
  score_get_found int not null,
  score_look_engaged int not null,
  score_stay_active int not null,

  -- Array of finding objects: {id, category, severity, headline,
  -- evidence, benchmark, ctaPrimary, ctaSecondary, score, weight}
  findings jsonb not null,

  -- Optional admin notes (e.g., "first audit after onboarding")
  notes text
);

create index if not exists idx_audit_runs_client_recent
  on audit_runs(client_id, ran_at desc);

comment on table audit_runs is
  'Apnosh Score snapshots. Run weekly per active client. Findings serialized as jsonb so the check catalog can evolve without migrations.';
