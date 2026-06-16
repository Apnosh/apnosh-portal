-- ─────────────────────────────────────────────────────────────
-- 166_campaigns.sql
--
-- Campaign domain ported from the flow-builder (System B). A campaign is a
-- budgeted bundle of priced line-items with an optional strategy brief, run
-- through a lifecycle (build → review → ship → monitor → iterate).
--
-- The priced catalog and campaign templates stay as static product config in
-- code (src/lib/campaigns/data/*) — only the per-client campaigns persist here.
-- The pure money/plan/compose logic lives in src/lib/campaigns/*.
--
-- Scoping + RLS mirror 153_owner_plans.sql: a client owns its campaigns,
-- admins see all. client_id is denormalised onto child rows so RLS stays
-- uniform and cheap.
-- ─────────────────────────────────────────────────────────────

-- ── campaigns ← CampaignDraft ────────────────────────────────
create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  name text not null default 'Untitled campaign',
  intent text not null default 'full-plan',     -- full-plan | one-off | ongoing | single-item
  path text not null default 'ai',              -- ai | strategist | diy
  budget_monthly integer not null default 0,
  planned boolean not null default false,
  goal_key text,                                -- regulars | new-customers | slow-nights | reviews
  occasion text,
  target_date date,
  context text,
  phase text not null default 'build',          -- build | review | ship | monitor | iterate
  status text not null default 'draft',         -- draft | shipped
  shipped_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists campaigns_client_idx on campaigns (client_id, status);

-- ── campaign_line_items ← LineItem ───────────────────────────
create table if not exists campaign_line_items (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  position integer not null default 0,
  service_id text not null,
  name text not null,
  plain text,
  does text,
  stage text not null,                          -- StageId | 'foundation'
  price integer not null default 0,
  cadence jsonb not null default '{"kind":"one-time"}'::jsonb,  -- tagged union
  eta text,
  qty integer,
  included boolean not null default true,
  opt_out text,                                 -- null | 'have-it' | 'diy'
  paused boolean not null default false,
  lock text not null default 'editable',        -- editable | in-production | delivered
  metric jsonb,
  why text,
  market jsonb,
  created_at timestamptz not null default now()
);
create index if not exists cli_campaign_idx on campaign_line_items (campaign_id, position);
create index if not exists cli_client_idx on campaign_line_items (client_id);

-- ── campaign_briefs ← System-B CampaignBrief (one per campaign) ─
create table if not exists campaign_briefs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null unique references campaigns(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  template_id text,
  objective text,
  offer jsonb,
  audience_ids text[] not null default '{}',
  channel_ids text[] not null default '{}',
  kpi text,
  duration_weeks integer,
  projected text,
  content_beats jsonb not null default '[]'::jsonb,
  spec jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── RLS ──────────────────────────────────────────────────────
alter table campaigns enable row level security;
alter table campaign_line_items enable row level security;
alter table campaign_briefs enable row level security;

create policy "client manages own campaigns" on campaigns for all
  using (client_id in (
    select b.client_id from businesses b where b.owner_id = auth.uid()
    union
    select cu.client_id from client_users cu where cu.auth_user_id = auth.uid()
  ))
  with check (client_id in (
    select b.client_id from businesses b where b.owner_id = auth.uid()
    union
    select cu.client_id from client_users cu where cu.auth_user_id = auth.uid()
  ));
create policy "admin all campaigns" on campaigns for all using (is_admin()) with check (is_admin());

create policy "client manages own campaign line items" on campaign_line_items for all
  using (client_id in (
    select b.client_id from businesses b where b.owner_id = auth.uid()
    union
    select cu.client_id from client_users cu where cu.auth_user_id = auth.uid()
  ))
  with check (client_id in (
    select b.client_id from businesses b where b.owner_id = auth.uid()
    union
    select cu.client_id from client_users cu where cu.auth_user_id = auth.uid()
  ));
create policy "admin all campaign line items" on campaign_line_items for all using (is_admin()) with check (is_admin());

create policy "client manages own campaign briefs" on campaign_briefs for all
  using (client_id in (
    select b.client_id from businesses b where b.owner_id = auth.uid()
    union
    select cu.client_id from client_users cu where cu.auth_user_id = auth.uid()
  ))
  with check (client_id in (
    select b.client_id from businesses b where b.owner_id = auth.uid()
    union
    select cu.client_id from client_users cu where cu.auth_user_id = auth.uid()
  ));
create policy "admin all campaign briefs" on campaign_briefs for all using (is_admin()) with check (is_admin());
