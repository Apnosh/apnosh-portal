-- ============================================================
-- Migration 058: client_tasks — unified work-item layer
-- ============================================================
-- One table, two audiences: admin tasks and client-facing asks share
-- the same rows but are filtered by `assignee_type` + `visible_to_client`.
-- Every task can optionally link back to the interaction, invoice, or
-- content request that spawned it, so the activity timeline and this
-- table stay tightly connected.
--
-- Why one table instead of separate admin_tasks + client_requests:
--   - A "get logo from Apnosh" task is ONE truth; admin sees "Waiting on
--     Apnosh," client sees "Send your logo." Two views, one row.
--   - Task counts, overdue detection, and reporting all happen in one
--     query rather than UNION'd across tables.
--
-- State machine stays tiny on purpose: todo / doing / done / canceled.
-- "Snoozed" is NOT a state — it's a `snoozed_until` timestamp so you
-- can snooze a task at any state without bloating the state machine.
--
-- Activity trail: state changes write rows into client_interactions
-- with kind='other' + metadata.task_id. We do NOT keep a separate
-- task_activity table; the interactions log is already our audit layer.
-- ============================================================

create table client_tasks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,

  -- Content
  title text not null,
  body text,

  -- Lifecycle
  status text not null default 'todo'
    check (status in ('todo', 'doing', 'done', 'canceled')),
  -- Orthogonal to status: a task can be snoozed from any active state.
  -- When snoozed_until > now(), surface filters should hide the task.
  snoozed_until timestamptz,

  -- When should this be done. Null = no deadline.
  due_at timestamptz,

  -- Assignment. assignee_type tells us which table the id points at,
  -- but we don't add a hard FK since it could be profiles (admin) or
  -- client_users (client). Null = unassigned.
  assignee_type text check (assignee_type in ('admin', 'client')),
  assignee_id uuid,

  -- Client-facing gate. Admin-only tasks (internal reminders) stay
  -- false. Tasks the client should see on their dashboard flip true.
  visible_to_client boolean not null default false,

  -- Optional links back to the source that spawned this task. Nullable
  -- FKs beat a polymorphic `links` table here — only ~4 source types
  -- exist and predictable joins matter more than flexibility.
  interaction_id uuid references client_interactions(id) on delete set null,
  invoice_id uuid references invoices(id) on delete set null,
  content_id uuid references content_queue(id) on delete set null,

  -- Where did this task come from? Helps analyze which automation
  -- paths actually produce value.
  source text not null default 'manual'
    check (source in ('manual', 'auto_nlp', 'auto_invoice', 'template')),

  -- Audit
  created_by uuid references profiles(id) on delete set null,
  completed_by uuid references profiles(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

-- Index for per-client lists (most common query).
create index idx_client_tasks_client_status on client_tasks(client_id, status);

-- Index for the admin Today page: active tasks sorted by due date.
-- `coalesce(snoozed_until, '-infinity')` lets us filter out snoozed
-- tasks with a single comparison (`< now()`).
create index idx_client_tasks_active_due
  on client_tasks(due_at)
  where status in ('todo', 'doing');

-- Index for "my tasks" queries.
create index idx_client_tasks_assignee
  on client_tasks(assignee_type, assignee_id, status)
  where assignee_id is not null;

-- Link lookups (rare but useful for the activity timeline).
create index idx_client_tasks_interaction on client_tasks(interaction_id) where interaction_id is not null;
create index idx_client_tasks_invoice on client_tasks(invoice_id) where invoice_id is not null;
create index idx_client_tasks_content on client_tasks(content_id) where content_id is not null;

-- Keep updated_at fresh.
create or replace function trigger_client_tasks_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  -- When a task flips to done/canceled, stamp completed_at once.
  if new.status in ('done', 'canceled') and old.status not in ('done', 'canceled') then
    new.completed_at = now();
  elsif new.status not in ('done', 'canceled') then
    new.completed_at = null;
  end if;
  return new;
end $$;

create trigger client_tasks_set_updated_at
before update on client_tasks
for each row execute function trigger_client_tasks_set_updated_at();

-- ============================================================
-- RLS
-- ============================================================

alter table client_tasks enable row level security;

-- Admins: full access.
create policy "admin full access on client_tasks"
  on client_tasks for all
  to authenticated
  using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  )
  with check (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- Clients: read-only access to their own visible tasks. No inserts or
-- updates from the client portal for now — task creation is admin-led.
-- When we add client-side self-service, this policy will be expanded
-- to allow updates on status (mark done) for tasks assigned to them.
create policy "client reads own visible tasks"
  on client_tasks for select
  to authenticated
  using (
    visible_to_client = true
    and client_id in (
      select client_id from client_users
      where auth_user_id = auth.uid()
    )
  );
