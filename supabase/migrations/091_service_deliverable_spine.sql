-- 090_service_deliverable_spine.sql
--
-- Q1 wk 10 (1.1a) -- the service-deliverable spine.
--
-- Today: a deliverable lands without a hard link to "which Tier 2
-- service this counts toward." Clients on social-media-management can
-- see deliverables but not "you got 12 posts this month under your
-- Social plan."
--
-- This migration adds:
--   - deliverables.service_id   (nullable; links a deliverable to a
--     row in client_services)
--   - deliverables.cycle_month  (date, first-of-month; the billing
--     cycle this deliverable counts toward)
--   - service_expectations      (service_id × deliverable_type ×
--     expected_count_per_month) -- the matrix used to render
--     "delivered vs expected" in the wk 11 view.
--
-- Heuristic backfill maps existing deliverables.type to a service when
-- the client has exactly one active service with a matching expected
-- type. Anything ambiguous stays nullable; strategists fill in via
-- the wk 11 admin view.

alter table deliverables
  add column if not exists service_id uuid
    references client_services(id) on delete set null,
  add column if not exists cycle_month date;

create index if not exists idx_deliverables_service
  on deliverables(service_id, cycle_month);
create index if not exists idx_deliverables_cycle
  on deliverables(client_id, cycle_month);

-- ── service_expectations matrix ──────────────────────────────────

create table if not exists service_expectations (
  id uuid primary key default gen_random_uuid(),
  service_slug text not null,                    -- e.g. 'social-media-management'
  deliverable_type text not null,                -- matches deliverables.type
  expected_count_per_month integer not null check (expected_count_per_month >= 0),
  notes text,
  created_at timestamptz not null default now()
);

create unique index if not exists service_expectations_unique
  on service_expectations(service_slug, deliverable_type);

alter table service_expectations enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public'
      and tablename='service_expectations' and policyname='Anyone reads service_expectations'
  ) then
    create policy "Anyone reads service_expectations"
      on service_expectations for select using (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public'
      and tablename='service_expectations' and policyname='Admins manage service_expectations'
  ) then
    create policy "Admins manage service_expectations"
      on service_expectations for all using (is_admin());
  end if;
end $$;

-- ── Seed: top 8 services × expected deliverables per month ───────
-- Numbers reflect the standard Tier 2 contracts. Strategists can
-- override per-client via client_services.metadata in a future pass.
insert into service_expectations(service_slug, deliverable_type, expected_count_per_month, notes) values
  ('social-media-management',  'social_post',     12, 'Standard tier: 3 posts/wk'),
  ('social-media-management',  'reel',             4, 'Standard tier: 1/wk'),
  ('social-media-management',  'story',           20, 'Cross-posted from feed + extras'),
  ('local-seo-management',     'gbp_post',         4, '1/wk Google Business post'),
  ('local-seo-management',     'review_response', 10, 'Reply window'),
  ('email-sms',                'email_campaign',   4, 'Weekly newsletter'),
  ('email-sms',                'sms_blast',        2, 'Twice-monthly promo'),
  ('content-creation',         'photo',            8, 'Twice-monthly shoot output'),
  ('content-creation',         'video',            4, '1/wk reel-ready video'),
  ('paid-social',              'ad_creative',      6, 'Rotating ad set creatives'),
  ('reputation-management',    'review_response', 12, 'Includes negative-review handling'),
  ('website-management',       'website_update',   2, 'Monthly content/menu refresh')
on conflict do nothing;

-- ── Heuristic backfill of deliverables.cycle_month ───────────────
-- Use approved_at when present, else created_at. cycle_month = first
-- of that month.
update deliverables
   set cycle_month = date_trunc('month', coalesce(approved_at, created_at))::date
 where cycle_month is null;

-- ── Heuristic backfill of deliverables.service_id ────────────────
-- For each deliverable, if the client has exactly one active service
-- whose slug matches a service_expectations row for this deliverable's
-- type, link them. Ambiguous cases stay null.
update deliverables d
   set service_id = cs.id
  from client_services cs
  join service_expectations se on se.service_slug = cs.service_slug
 where d.client_id = cs.client_id
   and d.service_id is null
   and cs.status = 'active'
   and se.deliverable_type = d.type
   and (
     select count(*) from client_services cs2
     join service_expectations se2 on se2.service_slug = cs2.service_id::text
     where cs2.client_id = d.client_id
       and cs2.status = 'active'
       and se2.deliverable_type = d.type
   ) = 1;
