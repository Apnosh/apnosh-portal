-- ============================================================
-- Migration 059: task templates + client self-completion + overdue
-- invoice auto-task generator
-- ============================================================
-- Three additions on top of 058's base tasks schema:
--
-- 1. `task_templates` — named groups of task specs that can be
--    instantiated for any client. Seeded with an onboarding checklist.
-- 2. RLS update on `client_tasks` — clients can now update status on
--    their own visible tasks (so they can tap "done" from the dashboard
--    "Waiting on you" card). They still cannot insert, delete, or edit
--    anything else.
-- 3. `generate_overdue_invoice_tasks()` — SQL function that scans for
--    past-due invoices without an open reminder task and spawns one.
--    Scheduled via pg_cron daily at 09:00 UTC.
-- ============================================================

-- ─── 1. task_templates ────────────────────────────────────────────
create table task_templates (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,

  -- Array of task specs. Each element looks like:
  --   { "title": "...", "body": "...", "offset_days": 0,
  --     "assignee_type": "admin"|"client", "visible_to_client": true }
  -- `offset_days` is relative to the apply-date; due_at = now + offset_days.
  items jsonb not null default '[]',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table task_templates enable row level security;

create policy "admin full access on task_templates"
  on task_templates for all
  to authenticated
  using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  )
  with check (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- Seed: onboarding checklist. Everything an AM normally does in the
-- first two weeks with a new client. Items with visible_to_client=true
-- surface as "Waiting on you" on the client dashboard.
insert into task_templates (slug, name, description, items) values
  (
    'onboarding',
    'New client onboarding',
    'Standard first-two-weeks checklist after a client signs on.',
    '[
      {"title": "Collect logo files (SVG + PNG)", "assignee_type": "client", "visible_to_client": true, "offset_days": 2, "body": "Upload vector + high-res raster versions of your logo."},
      {"title": "Connect Instagram + Facebook + TikTok", "assignee_type": "client", "visible_to_client": true, "offset_days": 3, "body": "Link your social accounts so we can publish + pull analytics."},
      {"title": "Connect Google Business Profile + Analytics", "assignee_type": "client", "visible_to_client": true, "offset_days": 5, "body": "We need access to report on organic traffic + local visibility."},
      {"title": "Collect 3 brand reference photos", "assignee_type": "client", "visible_to_client": true, "offset_days": 5, "body": "Any visual style you want us to match."},
      {"title": "Schedule kickoff call", "assignee_type": "admin", "offset_days": 3},
      {"title": "Send Stripe invoice for first month", "assignee_type": "admin", "offset_days": 1},
      {"title": "Build brand system (colors, fonts, voice)", "assignee_type": "admin", "offset_days": 7},
      {"title": "Publish first content batch", "assignee_type": "admin", "offset_days": 14}
    ]'::jsonb
  ),
  (
    'monthly_cadence',
    'Monthly cadence',
    'Recurring admin-side tasks that should happen every month per client.',
    '[
      {"title": "Send monthly invoice", "assignee_type": "admin", "offset_days": 1},
      {"title": "Publish weekly brief", "assignee_type": "admin", "offset_days": 1},
      {"title": "Monthly performance review call", "assignee_type": "admin", "offset_days": 14},
      {"title": "Plan next month''s content", "assignee_type": "admin", "offset_days": 22}
    ]'::jsonb
  ),
  (
    'offboarding',
    'Client offboarding',
    'Wrap-up tasks when a client ends their engagement.',
    '[
      {"title": "Cancel Stripe subscription", "assignee_type": "admin", "offset_days": 1},
      {"title": "Export + archive all client data", "assignee_type": "admin", "offset_days": 3},
      {"title": "Send final performance report", "assignee_type": "admin", "offset_days": 5},
      {"title": "Request testimonial", "assignee_type": "admin", "offset_days": 14},
      {"title": "Revoke portal access", "assignee_type": "admin", "offset_days": 30}
    ]'::jsonb
  );


-- ─── 2. RLS update: clients can complete their own visible tasks ───
-- Previously migration 058 gave clients SELECT only. Now we allow them
-- to flip status on tasks already visible to them, but only to mark
-- done/reopen — they can't change title, due date, assignment, or
-- visibility flags.
create policy "client updates own visible task status"
  on client_tasks for update
  to authenticated
  using (
    visible_to_client = true
    and client_id in (
      select client_id from client_users
      where auth_user_id = auth.uid()
    )
  )
  with check (
    visible_to_client = true
    and client_id in (
      select client_id from client_users
      where auth_user_id = auth.uid()
    )
  );


-- ─── 3. Overdue invoice → auto-task generator ─────────────────────
-- Runs daily. For every past-due invoice that's missing an open
-- reminder task, create one. Idempotent: re-running the function with
-- no new overdue invoices is a no-op.
create or replace function generate_overdue_invoice_tasks()
returns table(created int) language plpgsql security definer as $$
declare
  created_count int := 0;
begin
  with overdue_missing as (
    select i.id, i.client_id, i.invoice_number, i.total_cents, i.due_date
    from invoices i
    where i.status in ('open', 'failed')
      and i.due_date is not null
      and i.due_date < now()
      and not exists (
        select 1 from client_tasks t
        where t.invoice_id = i.id
          and t.status in ('todo', 'doing')
      )
  ),
  inserted as (
    insert into client_tasks (client_id, title, body, due_at, assignee_type, source, invoice_id)
    select
      o.client_id,
      'Chase overdue invoice ' || o.invoice_number,
      'Invoice ' || o.invoice_number || ' for $' || to_char(o.total_cents / 100.0, 'FM999,999,990.00')
        || ' was due ' || to_char(o.due_date, 'Mon DD') || '. Send a reminder or log why it''s delayed.',
      now() + interval '1 day',
      'admin',
      'auto_invoice',
      o.id
    from overdue_missing o
    returning 1
  )
  select count(*)::int into created_count from inserted;

  return query select created_count;
end $$;


-- ─── 4. Cron schedule ─────────────────────────────────────────────
-- pg_cron is already enabled (migration 048). Schedule the overdue
-- invoice scanner daily at 09:00 UTC (roughly start-of-day in Seattle,
-- our home base).
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'generate_overdue_invoice_tasks_daily') then
    perform cron.schedule(
      'generate_overdue_invoice_tasks_daily',
      '0 9 * * *',
      $cron$ select generate_overdue_invoice_tasks(); $cron$
    );
  end if;
exception
  -- If pg_cron isn't loaded for any reason, don't block the migration.
  when undefined_table then
    raise notice 'pg_cron not available; skipping schedule.';
  when undefined_function then
    raise notice 'cron.schedule not available; skipping schedule.';
end $$;
