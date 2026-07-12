-- 207: AI Analyst report cache.
-- One cached read per client + window, so opening the Analyst page doesn't
-- re-bill the AI on every visit. The route serves the cache when it's fresh
-- (< 7 days) and regenerates on the owner's explicit Refresh.

create table if not exists analyst_reports (
  client_id uuid not null references clients(id) on delete cascade,
  window text not null default '30d',
  read jsonb not null,            -- the AI prose {bottomLine, working, fixes, blindSpots}
  funnel jsonb not null,          -- the authoritative numbers (from the grounded payload, never the model)
  business jsonb,
  reputation jsonb,
  model text,
  cost_cents int,
  generated_at timestamptz not null default now(),
  primary key (client_id, window)
);

alter table analyst_reports enable row level security;

-- admins manage everything
create policy analyst_reports_admin_all on analyst_reports
  for all using (is_admin()) with check (is_admin());

-- a client can read its own cached report
create policy analyst_reports_client_select on analyst_reports
  for select using (
    client_id = current_client_id() or client_id = current_user_client_id()
  );

notify pgrst, 'reload schema';
