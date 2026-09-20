-- 269: the monthly plan (owner 2026-09-19): a month of dated slots, each on a funnel stage.
-- Server-only, like 267/268. plan_months holds the month's thesis, rhythm, lean and money;
-- plan_slots holds every piece with its date, stage, options, price and what filled it.

create table if not exists public.plan_months (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  month text not null,                                   -- 'YYYY-MM'
  status text not null default 'draft' check (status in ('draft','started','done')),
  thesis text,
  rhythm jsonb not null default '{}'::jsonb,             -- {posts_week, graphics_week, reels_month, shoots_month, creator_quarter}
  lean text not null default 'asis' check (lean in ('seen','asis','in')),
  baseline jsonb not null default '{}'::jsonb,           -- Home's real 30d numbers when the month was built
  planned jsonb not null default '{}'::jsonb,            -- per stage: number + levers
  total_cents integer not null default 0,
  started_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, month)
);
alter table public.plan_months enable row level security;
revoke all on public.plan_months from anon, authenticated;

create table if not exists public.plan_slots (
  id uuid primary key default gen_random_uuid(),
  plan_month_id uuid not null references public.plan_months(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  date date not null,
  stage text not null check (stage in ('aware','interest','action','order','keep')),
  kind text not null,                                    -- post|graphic|reel|photos|creator|boost|print|offer|review|taste|sign|team
  label text,
  options jsonb not null default '{}'::jsonb,
  cents integer not null default 0,
  status text not null default 'planned' check (status in ('open','planned','minted','done','rolled','removed')),
  ref jsonb,                                             -- {kind:'request'|'booking'|'draft'|'page', id, href}
  why text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists plan_slots_month_idx on public.plan_slots (plan_month_id, date);
create index if not exists plan_slots_client_date_idx on public.plan_slots (client_id, date);
alter table public.plan_slots enable row level security;
revoke all on public.plan_slots from anon, authenticated;
