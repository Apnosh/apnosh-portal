-- ============================================================
-- Migration 074: AI Marketing Operator
-- ============================================================
-- The autonomous agent that runs each restaurant's marketing.
-- Runs on a cron schedule (daily/weekly), pulls recent metrics +
-- updates + brand context, asks Claude for proposed next actions,
-- queues them for restaurant approval. Approved actions execute
-- through the existing client_updates / fanout system.
--
-- Two tables:
--   agent_runs        -- one row per analysis pass, audit + cost trail
--   proposed_actions  -- the AI's outputs awaiting human review
-- ============================================================

create table if not exists agent_runs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  run_type text not null check (run_type in (
    'weekly_analysis', 'anomaly_check', 'manual'
  )),
  triggered_by text not null default 'cron' check (triggered_by in ('cron', 'manual', 'api')),

  -- Lifecycle
  status text not null default 'pending' check (status in (
    'pending', 'running', 'success', 'failed'
  )),
  started_at timestamptz default now(),
  completed_at timestamptz,
  error_message text,

  -- AI narrative + metadata
  summary text,                                -- human-readable summary
  raw_input jsonb,                             -- what we sent to Claude (debug)
  raw_output jsonb,                            -- what Claude returned (debug)
  model text,                                  -- model used (e.g. 'claude-sonnet-4-5')
  input_tokens int,
  output_tokens int,
  cost_usd numeric(10, 4),

  -- Bookkeeping
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_agent_runs_client_created on agent_runs(client_id, created_at desc);
create index if not exists idx_agent_runs_status on agent_runs(status);

-- AI's proposed actions awaiting approval.
-- Schema mirrors client_updates so executed proposals become updates seamlessly.
create table if not exists proposed_actions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  agent_run_id uuid references agent_runs(id) on delete set null,
  location_id uuid references gbp_locations(id) on delete cascade,

  -- Same shape as client_updates.type / payload / targets
  type text not null check (type in (
    'hours', 'menu_item', 'promotion', 'event', 'closure', 'asset', 'info', 'social_post'
  )),
  payload jsonb not null,
  targets text[] not null default '{}',
  scheduled_for timestamptz,                   -- when to publish if approved

  -- AI's reasoning + confidence (for trust-building over time)
  summary text not null,                       -- "Tuesday lunch promo — happy hour pho"
  reasoning text,                              -- "Calls down 15% on Tuesdays for 4 weeks; promo proven on similar pho restaurants"
  confidence_score numeric(3, 2) check (confidence_score between 0 and 1),
  category text,                               -- 'anomaly_response' | 'content' | 'maintenance' | 'opportunity'

  -- Approval workflow
  status text not null default 'pending' check (status in (
    'pending', 'approved', 'rejected', 'executed', 'expired', 'cancelled'
  )),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  executed_at timestamptz,
  rejection_reason text,

  -- Once executed, link back to the actual update record that was created
  executed_update_id uuid references client_updates(id) on delete set null,

  created_at timestamptz not null default now(),
  expires_at timestamptz                        -- auto-expire if not actioned
);

create index if not exists idx_proposed_actions_client_status on proposed_actions(client_id, status);
create index if not exists idx_proposed_actions_pending on proposed_actions(status, expires_at)
  where status = 'pending';
create index if not exists idx_proposed_actions_run on proposed_actions(agent_run_id);

-- ── RLS ───────────────────────────────────────────────────────
alter table agent_runs enable row level security;
alter table proposed_actions enable row level security;

create policy "admins manage agent_runs"
  on agent_runs for all using (is_admin()) with check (is_admin());

create policy "admins manage proposed_actions"
  on proposed_actions for all using (is_admin()) with check (is_admin());

create policy "clients read their proposed_actions"
  on proposed_actions for select
  using (
    client_id in (
      select client_id from client_users where auth_user_id = auth.uid()
    )
  );

create policy "clients read their agent_runs"
  on agent_runs for select
  using (
    client_id in (
      select client_id from client_users where auth_user_id = auth.uid()
    )
  );

notify pgrst, 'reload schema';
