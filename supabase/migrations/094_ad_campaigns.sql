-- ─────────────────────────────────────────────────────────────
-- 094_ad_campaigns.sql
--
-- Paid boost / ad campaigns table. Owners approve a spec from
-- /dashboard/social/boost; strategists launch the campaign in Meta
-- Ads Manager (today) and stash the platform campaign id back into
-- this row. Once the row carries metrics (reach / clicks / spend),
-- the Boost page renders an Active campaigns rail and the Social
-- hub renders a "Last boost result" card.
--
-- One row = one approved-and-launched campaign. We do NOT also write
-- to client_tasks for boost requests once this table exists — the
-- 'pending' status here is the strategist's queue.
-- ─────────────────────────────────────────────────────────────

create table if not exists ad_campaigns (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,

  -- What's being boosted. We keep a snapshot so the campaign still
  -- renders cleanly if the source post is deleted.
  source_post_id uuid references scheduled_posts(id) on delete set null,
  source_post_snapshot jsonb,

  -- Owner-approved spec
  budget_total numeric not null check (budget_total > 0),
  days integer not null check (days > 0),
  audience_preset text not null check (audience_preset in ('locals', 'foodies', 'recent', 'custom')),
  audience_notes text,

  -- Platform routing. Today everything is Meta (Facebook + Instagram).
  platform text not null default 'meta' check (platform in ('meta', 'tiktok', 'google')),
  platform_campaign_id text,
  platform_account_id text,

  -- Lifecycle
  status text not null default 'pending' check (status in (
    'pending',     -- owner approved, awaiting strategist launch
    'launching',   -- strategist confirming targeting / building creative
    'active',      -- live on platform
    'paused',
    'completed',   -- ran full duration
    'cancelled'    -- killed early
  )),
  launched_at timestamptz,
  ended_at timestamptz,

  -- Cached metrics (synced periodically from the ad platform).
  reach integer not null default 0,
  clicks integer not null default 0,
  impressions integer not null default 0,
  spend numeric not null default 0,
  foot_traffic_est integer,
  last_metrics_sync_at timestamptz,

  -- Audit
  created_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ad_campaigns_client_status_idx
  on ad_campaigns(client_id, status, created_at desc);

create index if not exists ad_campaigns_active_idx
  on ad_campaigns(status, launched_at desc)
  where status in ('active', 'launching');

create index if not exists ad_campaigns_post_idx
  on ad_campaigns(source_post_id)
  where source_post_id is not null;

-- updated_at trigger (reuses the existing helper from earlier migrations)
do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'ad_campaigns_set_updated_at'
  ) then
    create trigger ad_campaigns_set_updated_at
      before update on ad_campaigns
      for each row execute function set_updated_at();
  end if;
end $$;

alter table ad_campaigns enable row level security;

-- Admin full access
create policy "Admins manage ad_campaigns" on ad_campaigns
  for all using (is_admin());

-- Client reads own campaigns
create policy "Clients read own ad_campaigns" on ad_campaigns
  for select using (client_id = current_client_id());

comment on table ad_campaigns is
  'Paid boost / ad campaigns. Owner-approved via portal, strategist-launched in Meta Ads (today). One row per approved campaign across its full lifecycle.';

comment on column ad_campaigns.source_post_snapshot is
  'Denormalized post text + first media_url at boost time so the campaign still renders if the source post is deleted.';
