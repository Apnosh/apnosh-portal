-- Per-user inbox read state.
--
-- The inbox feed is dynamically composed from many sources
-- (deliverables, reviews, tasks, connections, etc.) and each row's
-- "id" is a composite string like "deliverable-<uuid>" or
-- "review-<uuid>" generated in src/lib/dashboard/get-inbox.ts.
--
-- We track read state by storing those composite ids per user. When
-- the inbox loads, we left-join this table and flip unread=false on
-- any item the user has tapped before.
--
-- Why composite text ids vs FK to source table: the source tables
-- live in different schemas and would each need their own join.
-- Keeping read state in one table keeps the lookup a single query
-- and lets new inbox sources opt in without schema changes.

create table if not exists user_inbox_read (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null,
  read_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

create index if not exists user_inbox_read_user_idx
  on user_inbox_read (user_id, read_at desc);

alter table user_inbox_read enable row level security;

drop policy if exists "user manages own inbox read" on user_inbox_read;
drop policy if exists "admin all inbox read" on user_inbox_read;

/* A signed-in user can read + write their own rows. */
create policy "user manages own inbox read"
  on user_inbox_read for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "admin all inbox read"
  on user_inbox_read for all
  using (is_admin()) with check (is_admin());

comment on table user_inbox_read is
  'Per-user read state for /dashboard/inbox items. Composite item_ids like "deliverable-<uuid>" match what get-inbox.ts emits.';
