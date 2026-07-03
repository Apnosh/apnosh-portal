-- ============================================================================
-- Migration 195 — Admin performance indexes
--
-- Backs the admin surface's hot read paths that were doing sequential scans or
-- unindexed sorts on tables that grow forever. All are additive (no data change).
--
-- NOTE: every CREATE INDEX uses CONCURRENTLY so it does not take an exclusive
-- lock on a live table. CONCURRENTLY cannot run inside a transaction block — run
-- these statements individually, not wrapped in begin/commit.
-- ============================================================================

-- /admin/orders: full read ordered by created_at (was unindexed -> seq scan + sort).
create index concurrently if not exists idx_orders_created_at
  on public.orders (created_at desc);

-- /admin/queue: full read ordered by created_at (was unindexed).
create index concurrently if not exists idx_content_queue_created_at
  on public.content_queue (created_at desc);

-- Nav unread-messages badge (runs on every admin page): count of unread,
-- non-admin messages. Partial index stays tiny — only unread rows.
create index concurrently if not exists idx_messages_unread_nonadmin
  on public.messages (created_at)
  where read_at is null and sender_role <> 'admin';

-- Global header search (mounted on every admin page) does leading-wildcard ILIKE
-- ('%term%') on these columns — non-sargable for btree, so it seq-scanned each.
-- pg_trgm GIN indexes make substring search index-backed.
create extension if not exists pg_trgm;

create index concurrently if not exists idx_clients_name_trgm
  on public.clients using gin (name gin_trgm_ops);

create index concurrently if not exists idx_client_tasks_title_trgm
  on public.client_tasks using gin (title gin_trgm_ops);

create index concurrently if not exists idx_invoices_number_trgm
  on public.invoices using gin (invoice_number gin_trgm_ops);

-- Clients list bulk-loads recent gbp_metrics (date-bounded in code now); a plain
-- date index serves the global `date >= cutoff order by date desc` read.
create index concurrently if not exists idx_gbp_metrics_date
  on public.gbp_metrics (date desc);

-- Agent-reviews dashboard scans these by created_at time windows (were unindexed).
create index concurrently if not exists idx_agent_turns_created_at
  on public.agent_conversation_turns (created_at desc);

create index concurrently if not exists idx_agent_tool_exec_created_at
  on public.agent_tool_executions (created_at desc);

create index concurrently if not exists idx_agent_evals_created_at
  on public.agent_evaluations (created_at desc);
