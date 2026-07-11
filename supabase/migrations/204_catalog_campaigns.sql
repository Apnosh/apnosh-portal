-- Admin-created catalog campaigns (Phase C2 of the campaign-catalog systemization).
-- One row per campaign the admin CREATES in the CMS (built-in campaigns stay in code
-- and are only content-overridden via catalog_content_overrides, migration 203).
--
-- SERVICES-ONLY by design (the owner-approved scope): the admin picks real serviceIds
-- from the priced catalog and everything else derives at runtime — pricing from the
-- adapter's svcLines rail, what-you-get from the services' deliverables, requirements
-- from turnaround gates, timeline from SERVICE_TURNAROUND. No free-text price fields
-- exist anywhere, so a DB campaign can never invent a price or a deliverable.
--
-- id is the campaign's slug. It must never collide with a built-in catalog id; the
-- admin API enforces that against the in-code id set (the DB cannot know it).
-- status: 'draft' rows are admin-only; only 'live' rows reach the owner store.
-- Served through the admin client (service role), so RLS locks out direct access.
create table if not exists catalog_campaigns (
  id text primary key,
  title text not null,
  tagline text,
  description text,
  promise text,
  why text,
  expectation text,
  /* public URL in the client-graphics storage bucket (catalog-content/ folder) */
  hero_image text,
  best_for text,
  /* [{ "q": string, "a": string }] */
  faq jsonb,
  /* card type — one of the JSX card types (plan/content/email/task/automation) */
  type text not null default 'task',
  /* cadence tag — once/recurring/auto/setup/group (CADENCE_TAG) */
  cad text not null default 'once',
  /* home-funnel stages this campaign moves (aware/interest/actions/orders/back) */
  stages text[] not null default '{}',
  /* the store shelf row this card sits on (aware/interest/actions/orders/back/programs/content) */
  shelf text not null default 'aware',
  /* REAL priced-catalog service ids — the campaign's entire composition */
  service_ids text[] not null default '{}',
  /* optional add-on services (recurring-capable), offered on the PDP as extras */
  addon_service_ids text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft','live')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

alter table catalog_campaigns enable row level security;

do $$ begin
  create policy "admin all catalog_campaigns"
    on catalog_campaigns for all
    using (is_admin())
    with check (is_admin());
exception when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
