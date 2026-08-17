-- Choose-your-metrics (owner ask 2026-08-18): each client picks which metrics
-- show and count on their dashboard. Display-only preferences - collection
-- never stops, so re-enabling a metric brings its full history back.
create table if not exists client_metric_prefs (
  client_id uuid primary key references clients(id) on delete cascade,
  -- source ids (source-registry) the client turned OFF; everything else is on
  disabled_sources jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table client_metric_prefs enable row level security;
-- service role only (all reads/writes go through the server)
