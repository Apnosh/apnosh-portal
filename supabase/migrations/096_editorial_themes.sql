-- ─────────────────────────────────────────────────────────────
-- 096_editorial_themes.sql
--
-- Monthly editorial themes per client. Lets strategists set the
-- "story of the month" for each restaurant — main theme, content
-- pillars to lean on, and key dates to plan around.
--
-- Client sees these on /dashboard/social/plan with a calendar view
-- so they understand WHY this month's content slate looks like it
-- does, not just WHAT is scheduled.
--
-- One row per client × month (first-of-month). Strategist sets a
-- few months in advance; the client-facing page reads the current
-- and next month.
-- ─────────────────────────────────────────────────────────────

create table if not exists editorial_themes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,

  -- First day of the month this theme covers (e.g. '2026-05-01')
  month date not null,

  -- The main story for the month — strategist's pitch
  theme_name text not null,
  theme_blurb text,

  -- Content pillars to lean on this month, e.g. ['hero dish', 'team', 'kitchen story']
  pillars text[] not null default '{}',

  -- Key dates the month is built around. JSONB array of:
  --   { date: '2026-05-12', label: 'Mother's Day', note: '...' }
  key_dates jsonb not null default '[]',

  -- Internal-only planning note for the strategist
  strategist_notes text,

  status text not null default 'planning' check (status in (
    'planning',    -- strategist drafting
    'shared',      -- visible to client on the plan page
    'archived'     -- historical
  )),

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (client_id, month)
);

create index if not exists editorial_themes_client_month_idx
  on editorial_themes(client_id, month desc);

-- updated_at trigger
do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'editorial_themes_set_updated_at'
  ) then
    create trigger editorial_themes_set_updated_at
      before update on editorial_themes
      for each row execute function set_updated_at();
  end if;
end $$;

alter table editorial_themes enable row level security;

create policy "Admins manage editorial_themes" on editorial_themes
  for all using (is_admin());

create policy "Clients read own shared editorial_themes" on editorial_themes
  for select using (
    client_id = current_client_id()
    and status = 'shared'
  );

comment on table editorial_themes is
  'Monthly editorial plan per client. Strategist sets theme + pillars + key dates; client sees on /dashboard/social/plan when status is shared.';
