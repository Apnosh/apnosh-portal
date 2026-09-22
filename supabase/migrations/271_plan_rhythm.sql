-- 271: the rhythm (owner 2026-09-21, "a lot of these are recurring"): set once, every month's
-- draft starts from it. One row per client. Server-only like 269.
create table if not exists public.plan_rhythm (
  client_id uuid primary key references public.clients(id) on delete cascade,
  posts_week integer not null default 4,
  graphics_week integer not null default 1,
  reels_month integer not null default 1,
  shoots_month integer not null default 1,
  creator_quarter integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.plan_rhythm enable row level security;
revoke all on public.plan_rhythm from anon, authenticated;
