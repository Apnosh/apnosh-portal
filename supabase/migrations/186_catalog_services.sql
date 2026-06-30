-- ─────────────────────────────────────────────────────────────
-- 186_catalog_services.sql
--
-- The catalog as the editable HEART: one row per service, the future source of
-- truth the admin store edits, the AI plan builder selects from, and owners shop.
-- ADDITIVE + isolated: a brand-new table. It does NOT touch billing (service_catalog,
-- service_module_catalog) — those stay as-is; reconciling them is a later, separate step.
--
-- The pure/synchronous composer (composePlanForGoal) keeps reading a build-time
-- GENERATED TS snapshot of this table (never the DB at request time), so nothing about
-- the instant/offline plan path changes. The seed (187_catalog_services_seed.sql) loads
-- today's 64 services, parity-verified byte-identical to the in-code PRICED_CATALOG via
-- catalog-db-shape.ts (rowToService(serviceToRow(s)) === s). Nested bits ride as JSONB so
-- the round-trip stays exact and the table is one clean row per service.
--
-- RLS: the catalog is a shared shelf — anyone signed in reads ACTIVE rows (the store +
-- the snapshot read); only admins write. Drafts/archived are admin-only. Mirrors the
-- is_admin() pattern used across the schema.
-- ─────────────────────────────────────────────────────────────

create table if not exists catalog_services (
  id          text primary key,                         -- stable kebab id, e.g. 'gbp-setup'
  section     text not null,                             -- 'foundation' | a growth-loop StageId
  name        text not null,                             -- internal catalog name
  plain_name  text,                                      -- owner-facing name (was PLAIN_NAMES)
  description text not null,
  essential   boolean not null default false,
  handler     text not null check (handler in ('apnosh', 'ai', 'hybrid')),
  handler_why text not null default '',
  evidence    text,
  compliance  text,
  metric      jsonb,                                     -- { label, expect }
  prices      jsonb not null default '[]'::jsonb,        -- PricePoint[] (amount, kind, unit?, cost, note?, passthrough?, market?)
  goal_plays  jsonb,                                     -- GoalPlay[] (goal, stage, minTier, weight?, role, because?)
  fit         jsonb,                                     -- ServiceFit { great?, avoid? }
  pieces      jsonb,                                     -- { label, qty }[]
  status      text not null default 'active' check (status in ('active', 'draft', 'archived', 'coming_soon')),
  sort_order  int  not null default 0,
  updated_by  uuid references auth.users(id) on delete set null,
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

create index if not exists catalog_services_section_idx on catalog_services (section, sort_order);
create index if not exists catalog_services_status_idx  on catalog_services (status);

alter table catalog_services enable row level security;

create policy "read active services" on catalog_services for select
  using (status = 'active' or is_admin());

create policy "admin writes services" on catalog_services for all
  using (is_admin()) with check (is_admin());
