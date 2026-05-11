-- ─────────────────────────────────────────────────────────────
-- 104_strategist_rls.sql
--
-- Lets non-admin strategists read the data they need for /work/*,
-- scoped to the clients they're assigned to (via role_assignments).
--
-- Admins are unaffected (already covered by is_admin() policies).
-- Clients are unaffected (already covered by client_users + ownership
-- policies).
--
-- New scope is exactly: rows whose client_id is in the strategist's
-- assigned book. Uses the assigned_client_ids() function from 101.
-- ─────────────────────────────────────────────────────────────

-- 1) clients: strategist can read clients in their book.
drop policy if exists "strategist reads assigned clients" on clients;
create policy "strategist reads assigned clients"
  on clients for select
  using (
    has_capability('strategist')
    and id in (select assigned_client_ids())
  );

-- 2) client_tasks: read all tasks for clients in their book.
drop policy if exists "strategist reads assigned tasks" on client_tasks;
create policy "strategist reads assigned tasks"
  on client_tasks for select
  using (
    has_capability('strategist')
    and client_id in (select assigned_client_ids())
  );

-- 3) client_tasks: write (mark done, snooze) for clients in their book.
drop policy if exists "strategist updates assigned tasks" on client_tasks;
create policy "strategist updates assigned tasks"
  on client_tasks for update
  using (
    has_capability('strategist')
    and client_id in (select assigned_client_ids())
  )
  with check (
    has_capability('strategist')
    and client_id in (select assigned_client_ids())
  );

drop policy if exists "strategist inserts assigned tasks" on client_tasks;
create policy "strategist inserts assigned tasks"
  on client_tasks for insert
  with check (
    has_capability('strategist')
    and client_id in (select assigned_client_ids())
  );

-- 4) content_quotes: read + write quotes for clients in their book.
drop policy if exists "strategist reads assigned quotes" on content_quotes;
create policy "strategist reads assigned quotes"
  on content_quotes for select
  using (
    has_capability('strategist')
    and client_id in (select assigned_client_ids())
  );

drop policy if exists "strategist writes assigned quotes" on content_quotes;
create policy "strategist writes assigned quotes"
  on content_quotes for all
  using (
    has_capability('strategist')
    and client_id in (select assigned_client_ids())
  )
  with check (
    has_capability('strategist')
    and client_id in (select assigned_client_ids())
  );

-- 5) ad_campaigns: read assigned book.
drop policy if exists "strategist reads assigned campaigns" on ad_campaigns;
create policy "strategist reads assigned campaigns"
  on ad_campaigns for select
  using (
    has_capability('strategist')
    and client_id in (select assigned_client_ids())
  );

-- 6) deliverables: read assigned book.
drop policy if exists "strategist reads assigned deliverables" on deliverables;
create policy "strategist reads assigned deliverables"
  on deliverables for select
  using (
    has_capability('strategist')
    and client_id in (select assigned_client_ids())
  );

-- 7) editorial_themes: read assigned book.
drop policy if exists "strategist reads assigned themes" on editorial_themes;
create policy "strategist reads assigned themes"
  on editorial_themes for select
  using (
    has_capability('strategist')
    and client_id in (select assigned_client_ids())
  );

-- 8) social_posts: read assigned book.
drop policy if exists "strategist reads assigned posts" on social_posts;
create policy "strategist reads assigned posts"
  on social_posts for select
  using (
    has_capability('strategist')
    and client_id in (select assigned_client_ids())
  );

comment on policy "strategist reads assigned clients" on clients is
  'Non-admin strategists see only clients they are assigned to via role_assignments. Admins are covered by the separate is_admin() policy.';
