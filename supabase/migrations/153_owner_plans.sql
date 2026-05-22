-- Owner-facing marketing planner.
--
-- Backs /dashboard/analytics (repurposed into "Plan"): a Notion-style
-- calendar where a restaurant owner schedules their own marketing
-- moments — promotions, events, specials, content ideas, holidays to
-- act on, and reminders.
--
-- This is distinct from the Apnosh-produced content pipeline
-- (content_calendar_items, scheduled_posts, deliverables). Those are
-- what the agency schedules FOR the client and are surfaced read-only
-- in the same unified calendar. owner_plans is the only table the
-- client can create/edit/delete in that view.
--
-- Soft-delete via deleted_at (Notion-like trash) so an accidental
-- delete is recoverable; the data layer filters deleted_at is null.

create table if not exists owner_plans (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,

  title text not null,
  -- Marketing-moment type. Drives the icon + accent colour in the UI.
  kind text not null default 'event'
    check (kind in ('promotion', 'event', 'special', 'content', 'holiday', 'reminder')),
  notes text,

  -- Scheduling. start_date is required; end_date null = single day.
  -- all_day true (default) ignores start_time.
  start_date date not null,
  end_date date,
  all_day boolean not null default true,
  start_time time,

  -- Planning lifecycle, used as board columns / status chips.
  status text not null default 'planned'
    check (status in ('idea', 'planned', 'done')),

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  -- end_date, when set, must not precede start_date.
  constraint owner_plans_dates_ordered
    check (end_date is null or end_date >= start_date)
);

create index if not exists owner_plans_client_date_idx
  on owner_plans (client_id, start_date)
  where deleted_at is null;

create index if not exists owner_plans_client_status_idx
  on owner_plans (client_id, status)
  where deleted_at is null;

-- ── updated_at trigger ──
create or replace function owner_plans_set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists owner_plans_updated_at on owner_plans;
create trigger owner_plans_updated_at
  before update on owner_plans
  for each row execute function owner_plans_set_updated_at();

-- ── RLS ──
alter table owner_plans enable row level security;

drop policy if exists "client manages own plans" on owner_plans;
drop policy if exists "admin all plans" on owner_plans;

/* A client (restaurant owner / team member) can fully manage plans for
   the client(s) they belong to — resolved via the same two link tables
   the app uses everywhere: businesses.owner_id and
   client_users.auth_user_id. */
create policy "client manages own plans"
  on owner_plans for all
  using (
    client_id in (
      select b.client_id from businesses b where b.owner_id = auth.uid()
      union
      select cu.client_id from client_users cu where cu.auth_user_id = auth.uid()
    )
  )
  with check (
    client_id in (
      select b.client_id from businesses b where b.owner_id = auth.uid()
      union
      select cu.client_id from client_users cu where cu.auth_user_id = auth.uid()
    )
  );

create policy "admin all plans"
  on owner_plans for all
  using (is_admin()) with check (is_admin());

comment on table owner_plans is
  'Owner-created marketing plan items for /dashboard/analytics (Plan). Distinct from the agency content pipeline; soft-deleted via deleted_at.';
