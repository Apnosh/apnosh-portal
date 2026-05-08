-- 088_client_assignments.sql
--
-- Q1 wk 7 (1.3) -- one strategist per client.
--
-- Adds clients.assigned_team_member_id so the strategist console can
-- filter "my clients" without unioning every interaction history. The
-- column is nullable; an unset assignment means "the founder/whoever's
-- on call this week handles it" -- the console sorts unassigned rows
-- to the top.
--
-- Phase 3 Decision 4 (RBAC) will replace this with a many-to-many
-- client_assignments table in Q2; for now the single-strategist model
-- matches how the team actually operates.

alter table clients
  add column if not exists assigned_team_member_id uuid
    references team_members(id) on delete set null;

create index if not exists idx_clients_assigned_team_member
  on clients(assigned_team_member_id);

comment on column clients.assigned_team_member_id is
  'Primary strategist / AM. Q2 RBAC migration replaces this with a '
  'many-to-many client_assignments table.';
