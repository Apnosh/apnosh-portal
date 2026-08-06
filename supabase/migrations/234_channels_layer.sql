-- ─────────────────────────────────────────────────────────────
-- 234: THE CHANNELS LAYER (docs/CHANNELS-PLAN.md, P1)
--
-- EXTENDS the existing channel_connections registry (043) rather
-- than reinventing it. Adds the two things the spine needs and
-- one health counter:
--
--   channel_sync_runs   — the health ledger. Every sync attempt,
--                         success or failure, leaves a row. Law 2:
--                         every channel fails loud.
--   pos_daily_sales     — canonical daily sales, one row per
--                         client x source x day. The UNIQUE key IS
--                         the idempotency guarantee (law 4).
--   consecutive_failures — on channel_connections, drives the
--                         alert-at-3 owner notification.
-- ─────────────────────────────────────────────────────────────

alter table public.channel_connections
  add column if not exists consecutive_failures int not null default 0;

create table if not exists public.channel_sync_runs (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.channel_connections(id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'ok' check (status in ('ok', 'error')),
  items_written int not null default 0,
  error_text text,
  created_at timestamptz not null default now()
);

create index if not exists channel_sync_runs_connection_idx
  on public.channel_sync_runs (connection_id, started_at desc);

create table if not exists public.pos_daily_sales (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  -- 'square' | 'clover' | 'statement:<app>' (e.g. statement:doordash)
  source text not null,
  day date not null,
  gross_cents bigint not null default 0,
  orders int not null default 0,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, source, day)
);

create index if not exists pos_daily_sales_client_day_idx
  on public.pos_daily_sales (client_id, day desc);

-- RLS: 233 house style. Sync runs are admin/ops-only; daily sales
-- are owner-visible data so clients read their own rows.
alter table public.channel_sync_runs enable row level security;
alter table public.pos_daily_sales enable row level security;

do $$ begin
  create policy channel_sync_runs_admin
    on public.channel_sync_runs for all
    using (is_admin()) with check (is_admin());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy pos_daily_sales_admin
    on public.pos_daily_sales for all
    using (is_admin()) with check (is_admin());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy pos_daily_sales_client_read
    on public.pos_daily_sales for select
    using (
      client_id in (
        select client_id from public.client_users where auth_user_id = auth.uid()
        union
        select client_id from public.businesses where owner_id = auth.uid()
      )
    );
exception when duplicate_object then null; end $$;
