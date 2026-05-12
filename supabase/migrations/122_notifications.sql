-- Extend the existing notifications table for the in-portal bell.
--
-- The table already exists with id/user_id/type/title/body/link/read_at/created_at
-- (used today for payment-confirmation notices to clients). We add
-- client_id + payload so staff-side notifications can carry scope/context.

alter table notifications
  add column if not exists client_id uuid references clients(id) on delete set null,
  add column if not exists payload   jsonb not null default '{}'::jsonb;

create index if not exists notifications_user_unread_idx
  on notifications(user_id, read_at, created_at desc);

create index if not exists notifications_client_idx
  on notifications(client_id, created_at desc)
  where client_id is not null;

comment on column notifications.client_id is 'Which client the notification is about (for staff routing/grouping).';
comment on column notifications.payload   is 'Type-specific structured data (e.g. {"draft_id": "..."}). Free-form.';

-- Make sure RLS gives users access to their own row (the existing
-- table may not have a policy yet).
alter table notifications enable row level security;

drop policy if exists "self read notifications"   on notifications;
drop policy if exists "self update notifications" on notifications;
drop policy if exists "admin all notifications"   on notifications;

create policy "self read notifications"
  on notifications for select
  using (user_id = auth.uid());

create policy "self update notifications"
  on notifications for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "admin all notifications"
  on notifications for all
  using (is_admin()) with check (is_admin());
