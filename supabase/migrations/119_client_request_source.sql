-- ─────────────────────────────────────────────────────────────
-- 119_client_request_source.sql
--
-- Extend client_tasks.source enum so we can distinguish the channels
-- a task came in through. The /work/inbox surface filters and groups
-- on this.
--
-- Existing values kept for backwards-compat: manual, auto_nlp,
-- auto_invoice, template.
-- New: client_request (submitted via /dashboard/social/request),
--      invoice_chase (auto-spawned from overdue invoices),
--      engage_followup (spawned from a comment/DM thread),
--      system (anything else auto-created),
--      admin (manually created by staff).
-- ─────────────────────────────────────────────────────────────

alter table client_tasks drop constraint if exists client_tasks_source_check;
alter table client_tasks add constraint client_tasks_source_check
  check (source = any (array[
    'manual',
    'auto_nlp',
    'auto_invoice',
    'template',
    'client_request',
    'invoice_chase',
    'engage_followup',
    'system',
    'admin'
  ]));

comment on column client_tasks.source is
  'Where this task originated. Drives grouping in /work/inbox.';
