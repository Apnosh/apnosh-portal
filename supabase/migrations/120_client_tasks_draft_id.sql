-- ─────────────────────────────────────────────────────────────
-- 120_client_tasks_draft_id.sql
--
-- Adds a draft_id column to client_tasks that points at the
-- content_drafts row created when a client request is Accepted in
-- /work/inbox. The existing content_id column references the legacy
-- content_queue table; we keep it for backwards compat but use the
-- new column for the v2 editorial flow.
-- ─────────────────────────────────────────────────────────────

alter table client_tasks
  add column if not exists draft_id uuid references content_drafts(id) on delete set null;

create index if not exists client_tasks_draft_id_idx
  on client_tasks(draft_id)
  where draft_id is not null;

comment on column client_tasks.draft_id is
  'Links a client_request task to the content_draft seeded from it. Set by /api/work/inbox/[id]/accept.';
