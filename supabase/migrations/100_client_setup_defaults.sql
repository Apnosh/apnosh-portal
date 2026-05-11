-- ─────────────────────────────────────────────────────────────
-- 100_client_setup_defaults.sql
--
-- Closes a class of dashboard-broken-on-first-login bugs.
--
-- Symptom: an existing user signs into the portal, /dashboard checks
--   setup.shapeSet && setup.goalsSet on /api/dashboard/load, finds
--   neither, fires router.replace('/setup'). For half-set-up test
--   accounts this is a confusing dead end ("dashboard doesn't work").
--
-- Root cause: clients were created without restaurant shape, goals,
--   or allotments. The setup wizard exists to capture those — but
--   not every client makes it through the wizard, and historical
--   admin-created clients skipped the wizard entirely.
--
-- Fix:
--   1. Default values on the four shape_* columns so a fresh client
--      always has a renderable baseline (strategist can refine later).
--   2. Backfill ANY remaining NULL shape rows (idempotent).
--   3. Trigger that seeds 3 active client_goals on INSERT when none
--      were provided. Mirrors the bulk backfill we just ran.
-- ─────────────────────────────────────────────────────────────

-- 1) Defaults on the shape columns. Existing data is untouched; only
--    INSERTs without an explicit value pick these up.
alter table clients
  alter column shape_footprint set default 'single_neighborhood',
  alter column shape_concept set default 'fast_casual',
  alter column shape_customer_mix set default 'local_repeat',
  alter column shape_digital_maturity set default 'active';

-- 2) Idempotent backfill in case any row still has NULLs.
update clients
  set shape_footprint = coalesce(shape_footprint, 'single_neighborhood'),
      shape_concept = coalesce(shape_concept, 'fast_casual'),
      shape_customer_mix = coalesce(shape_customer_mix, 'local_repeat'),
      shape_digital_maturity = coalesce(shape_digital_maturity, 'active'),
      shape_captured_at = coalesce(shape_captured_at, now())
  where shape_footprint is null
     or shape_concept is null
     or shape_customer_mix is null
     or shape_digital_maturity is null;

-- 3) Trigger to seed default goals on new clients.
create or replace function seed_default_client_goals() returns trigger
language plpgsql
as $$
begin
  -- Only act if there are no goals yet (idempotent vs. manual inserts
  -- that also include goals in the same transaction).
  if not exists (select 1 from client_goals where client_id = new.id) then
    insert into client_goals (client_id, goal_slug, priority, status)
    values
      (new.id, 'more_foot_traffic', 1, 'active'),
      (new.id, 'regulars_more_often', 2, 'active'),
      (new.id, 'more_online_orders', 3, 'active')
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists clients_seed_default_goals on clients;
create trigger clients_seed_default_goals
  after insert on clients
  for each row execute function seed_default_client_goals();

-- 4) Allotments default. Existing NULLs were already backfilled by
--    the manual SQL run; this guarantees future inserts get sensible
--    defaults too.
alter table clients
  alter column allotments set default jsonb_build_object(
    'social_posts_per_month', 12,
    'website_changes_per_month', 5,
    'seo_updates_per_month', 8,
    'email_campaigns_per_month', 4
  );

comment on function seed_default_client_goals is
  'Auto-seeds 3 default active goals (more_foot_traffic, regulars_more_often, more_online_orders) when a new client is inserted. Idempotent. Strategist refines via /admin/clients/[slug] or the setup wizard.';
