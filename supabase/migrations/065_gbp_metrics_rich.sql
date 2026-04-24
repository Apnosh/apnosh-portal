-- ============================================================
-- Migration 065: richer GBP metrics for Looker Studio backfill
-- ============================================================
-- The Looker Studio Google Business Profile connector returns more
-- granularity than our original `gbp_metrics` columns capture:
--   - impressions split by surface (Search vs Maps) and platform
--     (Mobile vs Desktop)
--   - photo views + photo count
--   - post views + post clicks
--   - per-day top search queries (stored as jsonb for flexibility)
--
-- Additive only; existing columns (directions, calls, website_clicks,
-- search_views) are untouched so nothing we've already ingested gets
-- invalidated. The legacy `search_views` is kept and will continue to
-- mirror total impressions for backwards compatibility.
-- ============================================================

alter table gbp_metrics
  add column if not exists impressions_search_mobile   integer not null default 0,
  add column if not exists impressions_search_desktop  integer not null default 0,
  add column if not exists impressions_maps_mobile     integer not null default 0,
  add column if not exists impressions_maps_desktop    integer not null default 0,
  add column if not exists impressions_total           integer not null default 0,
  add column if not exists photo_views                 integer not null default 0,
  add column if not exists photo_count                 integer not null default 0,
  add column if not exists post_views                  integer not null default 0,
  add column if not exists post_clicks                 integer not null default 0,
  add column if not exists conversations               integer not null default 0,
  add column if not exists bookings                    integer not null default 0,
  -- Top search queries: [{ query: 'best pho seattle', impressions: 412 }, ...]
  add column if not exists top_queries                 jsonb,
  -- Provenance for debugging ingest issues later
  add column if not exists source                      text,
  add column if not exists raw_row                     jsonb;

comment on column gbp_metrics.impressions_total is
  'Sum of Search + Maps impressions across platforms. Populated by the Looker Studio ingest; preferred over search_views going forward.';

comment on column gbp_metrics.top_queries is
  'Array of { query, impressions } for the top ~10 search terms that surfaced the business that day.';

comment on column gbp_metrics.source is
  'Where the row came from: looker_csv | manual_upload | gbp_api';

-- ============================================================
-- gbp_backfill_jobs: tracks each bulk upload so we can show a
-- history (when, by whom, how many rows, which clients matched)
-- ============================================================
create table if not exists gbp_backfill_jobs (
  id uuid primary key default gen_random_uuid(),
  uploaded_by uuid references auth.users(id) on delete set null,
  source      text not null default 'looker_csv',
  filename    text,
  row_count   integer not null default 0,
  matched_rows integer not null default 0,
  unmatched_rows integer not null default 0,
  unmatched_locations text[],
  date_range_start date,
  date_range_end   date,
  client_ids   uuid[],
  notes        text,
  created_at   timestamptz not null default now()
);

alter table gbp_backfill_jobs enable row level security;

-- Admins full access; no other role should see these.
do $$ begin
  create policy "admins manage gbp_backfill_jobs"
    on gbp_backfill_jobs for all
    using (is_admin())
    with check (is_admin());
exception when duplicate_object then null;
end $$;

-- Reload PostgREST schema cache so new columns are query-able immediately.
notify pgrst, 'reload schema';
