-- ─────────────────────────────────────────────────────────────
-- 114_editor_rls.sql
--
-- Editors need read on all 'uploaded' / 'completed' shoots in their
-- assigned book (so the queue across N clients works), and read on
-- the raw clips inside those shoots, and update on shoots they
-- complete.
--
-- The existing 103 policies only let editors see shoots they were
-- explicitly added to via shoot_crew. That's too narrow once we have
-- a queue surface — the editor takes whatever's next in the bucket.
-- ─────────────────────────────────────────────────────────────

-- Editors read shoots in their book that have hit the post-production phase.
drop policy if exists "editor reads assigned shoots" on shoots;
create policy "editor reads assigned shoots"
  on shoots for select
  using (
    has_capability('editor')
    and client_id in (select assigned_client_ids())
  );

drop policy if exists "editor updates assigned shoots" on shoots;
create policy "editor updates assigned shoots"
  on shoots for update
  using (
    has_capability('editor')
    and client_id in (select assigned_client_ids())
  )
  with check (
    has_capability('editor')
    and client_id in (select assigned_client_ids())
  );

-- Editors read all raw + final uploads on the shoots they can see.
drop policy if exists "editor reads shoot uploads" on shoot_uploads;
create policy "editor reads shoot uploads"
  on shoot_uploads for select
  using (
    has_capability('editor')
    and exists (
      select 1 from shoots s
      where s.id = shoot_uploads.shoot_id
        and s.client_id in (select assigned_client_ids())
    )
  );

-- Editors upload final cuts.
drop policy if exists "editor uploads finals" on shoot_uploads;
create policy "editor uploads finals"
  on shoot_uploads for insert
  with check (
    has_capability('editor')
    and uploaded_by = auth.uid()
    and exists (
      select 1 from shoots s
      where s.id = shoot_uploads.shoot_id
        and s.client_id in (select assigned_client_ids())
    )
  );
