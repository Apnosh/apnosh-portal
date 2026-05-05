-- 083_bespoke_handoff.sql
-- Designer handoff state. When the AM clicks "Hand off to designer",
-- we create a per-client GitHub repo + Vercel project, invite the
-- designer as a collaborator, and track the resulting URLs here.

alter table bespoke_sites
  add column if not exists github_repo_full_name text,    -- e.g. apnosh-sites/do-si-bbq
  add column if not exists github_repo_url text,
  add column if not exists vercel_project_id text,
  add column if not exists vercel_project_name text,
  add column if not exists vercel_deployment_url text,    -- live preview URL
  add column if not exists designer_email text,
  add column if not exists designer_github_username text,
  add column if not exists handed_off_at timestamptz,
  add column if not exists handoff_synced_at timestamptz, -- last time we pulled designer's edits
  add column if not exists handoff_synced_sha text;

-- Append-only log of every handoff action for auditing
create table if not exists bespoke_handoff_events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  event_type text not null,                  -- 'created' | 'invited' | 'deployed' | 'synced' | 'error'
  payload jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists bespoke_handoff_events_client_idx
  on bespoke_handoff_events(client_id, created_at desc);

alter table bespoke_handoff_events enable row level security;

drop policy if exists "handoff events: admin all" on bespoke_handoff_events;
create policy "handoff events: admin all" on bespoke_handoff_events
  for all
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'))
  with check (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'));

notify pgrst, 'reload schema';
