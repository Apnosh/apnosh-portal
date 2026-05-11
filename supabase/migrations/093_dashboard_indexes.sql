-- 093_dashboard_indexes.sql
--
-- Compound indexes for the queries the dashboard load endpoint hits
-- many times. Without these the audit found full table scans on
-- reviews (filtered by client_id + response_text IS NULL) and
-- scheduled_posts (filtered by client_id + status + scheduled_for).
--
-- All indexes use IF NOT EXISTS so re-running is safe.

-- Reviews: dashboard fetches recent + unanswered counts every load.
create index if not exists idx_reviews_client_responded
  on reviews(client_id, responded_at)
  where response_text is null;

create index if not exists idx_reviews_client_posted
  on reviews(client_id, posted_at desc);

-- Deliverables: legacy queries still hit business_id (see Q1
-- reconciliation memo wk 9); newer queries hit client_id. Cover both.
create index if not exists idx_deliverables_business_status
  on deliverables(business_id, status);

create index if not exists idx_deliverables_client_status
  on deliverables(client_id, status);

-- Scheduled posts: dashboard fetches scheduled+publishing in the next
-- 60 days for the marketing-calendar overlay.
create index if not exists idx_scheduled_posts_client_status_when
  on scheduled_posts(client_id, status, scheduled_for);

-- GBP + social metrics: daily reads scoped by client + date range.
create index if not exists idx_gbp_metrics_client_date
  on gbp_metrics(client_id, date desc);

create index if not exists idx_social_metrics_client_date
  on social_metrics(client_id, date desc);

-- ai_generations: brief cache lookup (client + task_type + recency).
create index if not exists idx_ai_generations_client_task_recent
  on ai_generations(client_id, task_type, created_at desc);

-- client_tasks: dashboard load filters on (visible_to_client, status, due_at).
create index if not exists idx_client_tasks_client_status_due
  on client_tasks(client_id, status, due_at);
