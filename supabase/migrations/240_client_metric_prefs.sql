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

-- 2026-08-18b: optional metrics a client can switch ON (likes+comments,
-- menu taps, search appearances). Separate from disabled_sources so
-- defaults stay exactly as shipped.
alter table client_metric_prefs
  add column if not exists enabled_sources jsonb not null default '[]'::jsonb;
