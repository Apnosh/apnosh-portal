-- ─────────────────────────────────────────────────────────────
-- 108_strategist_themes_write.sql
--
-- 104 gave strategists SELECT on editorial_themes; this gives them
-- INSERT/UPDATE/DELETE for clients in their assigned book so they
-- can manage the editorial calendar from /work/themes.
-- ─────────────────────────────────────────────────────────────

drop policy if exists "strategist writes assigned themes" on editorial_themes;
create policy "strategist writes assigned themes"
  on editorial_themes for all
  using (has_capability('strategist') and client_id in (select assigned_client_ids()))
  with check (has_capability('strategist') and client_id in (select assigned_client_ids()));
