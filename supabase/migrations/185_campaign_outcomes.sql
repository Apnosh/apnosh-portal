-- ─────────────────────────────────────────────────────────────
-- 185_campaign_outcomes.sql
--
-- Real per-campaign OUTCOME tracking (Phase 3). An append-style ledger of
-- marketing results (reach / engagement / reviews — NOT money), so owners see
-- what a campaign actually did and the planner can LEARN from real history.
--
-- Why a stored ledger and not compute-on-read: social_posts holds only the
-- MOST-RECENT stats snapshot (overwritten in place on each sync), so a piece's
-- trajectory over time, verdict stability across readings, and "this line
-- stopped working" memory cannot be reconstructed from live tables. We persist
-- one reading per piece per day; the owner display still reads live numbers,
-- and the planner's feedback loop learns off this ledger.
--
-- Honesty rule baked into the schema: has_data=false means "still gathering",
-- never a fabricated number. attribution_method records HOW a reading was
-- earned (a real per-post join vs a channel-level window lift) so the UI never
-- blurs a measurement with a correlation.
--
-- Scoping + RLS mirror 166_campaigns.sql: a client owns its rows, admins see
-- all. client_id is denormalised so RLS stays uniform and cheap.
-- ─────────────────────────────────────────────────────────────

create table if not exists campaign_outcomes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  scope text not null check (scope in ('piece', 'campaign')),

  -- piece-scope linkage (null on campaign-rollup rows)
  content_draft_id uuid references content_drafts(id) on delete set null,
  campaign_piece_key text,                       -- stable group:slot handle (mig 182)
  service_id text,                               -- catalog serviceId of the originating line → PlanningHistory key
  published_post_id uuid references social_posts(id) on delete set null,  -- the per-post join, when it exists

  -- the reading
  as_of_date date not null default current_date,
  attribution_method text not null check (attribution_method in ('per_post', 'window_lift', 'none')),
  metric_label text,                             -- 'reach' | 'engagement' | 'directions' (from LineItem.metric.label)
  reach integer,
  impressions integer,
  interactions integer,
  engagement_rate numeric,
  reviews_delta integer,
  rating_delta numeric,
  metric_delta numeric,                          -- signed normalized lift the verdict is based on → pastLines.metricDelta
  channel_lift jsonb,                            -- {metric, post_window, baseline_window, delta_pct} for window_lift rows
  baseline jsonb,                                -- matched pre-window numbers, for auditability

  verdict text check (verdict in ('working', 'watch', 'drop')),
  verdict_reason text,                           -- plain-language, owner-facing
  has_data boolean not null default false,       -- false ⇒ honest 'still gathering', NEVER a fabricated number
  source text not null default 'publish' check (source in ('reconcile', 'publish', 'poll', 'manual')),
  created_at timestamptz not null default now()
);

create index if not exists campaign_outcomes_campaign_idx on campaign_outcomes (campaign_id, scope, as_of_date desc);
create index if not exists campaign_outcomes_service_idx on campaign_outcomes (client_id, service_id) where service_id is not null;
-- One reading per piece (or campaign rollup) per day. Keyed on content_draft_id (the
-- true per-piece identity; campaign_piece_key can be null/duplicated), with '' standing
-- in for the single per-campaign rollup row (content_draft_id is null there).
create unique index if not exists campaign_outcomes_reading_uq
  on campaign_outcomes (campaign_id, scope, coalesce(content_draft_id::text, ''), as_of_date);

-- ── RLS (verbatim from 166_campaigns.sql) ────────────────────
alter table campaign_outcomes enable row level security;

create policy "client manages own campaign outcomes" on campaign_outcomes for all
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
create policy "admin all campaign outcomes" on campaign_outcomes for all using (is_admin()) with check (is_admin());
