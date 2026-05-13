-- Marketplace: one-off creator bookings.
--
-- Distinct from the team (ongoing roster). Marketplace creators are
-- people a restaurant books for a single engagement — a food
-- influencer for one feature, a photographer for one shoot, a
-- videographer for one project. Booked through Apnosh but not on
-- Apnosh's regular payroll.
--
-- Two new tables:
--   creator_profiles — booking-side info on top of profiles
--                      (handle, follower count, content style,
--                       service area, rate range, sample work)
--   booking_requests — owner-initiated request for a one-off booking
--                      (when, what for, budget, status)
--
-- Geographic scope is Washington-only for v1 (per user direction).
-- service_area is a text[] so we can expand without schema changes.

-- ─────────────────────────────────────────────────────────────────
-- creator_profiles
-- ─────────────────────────────────────────────────────────────────
create table if not exists creator_profiles (
  /* 1:1 with profiles. Existing strategists won't have a row;
     marketplace creators do. */
  person_id        uuid primary key references auth.users(id) on delete cascade,
  category         text not null
    check (category in ('food_influencer','photographer','videographer','other')),
  /* Display info that lives outside profiles since it's bookable-creator
     specific. handle = the @ name on their primary platform. */
  social_handle    text,
  social_platform  text
    check (social_platform is null or social_platform in ('instagram','tiktok','youtube','twitter','other')),
  follower_count   int,
  /* Free-form content-style tags (food porn, vlog reviews, Reels-first,
     fine-dining-aesthetic, etc.). Surfaced as filterable chips. */
  content_style    text[] not null default '{}',
  /* Geographic coverage. Two-letter state codes; default WA. */
  service_area     text[] not null default '{WA}',
  /* Human-readable rate range, e.g. "$200-$500 per post" or
     "$400 per 2-hour shoot". Free-form because comp structures
     vary wildly across categories. */
  typical_rate     text,
  /* URLs to sample work — IG post links, portfolio pages, Drive
     albums. Surfaced as thumbnails on the card. */
  sample_work_urls text[] not null default '{}',
  /* Gate so staff can stage profiles before they appear to clients. */
  bookable         boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists creator_profiles_category_idx
  on creator_profiles (category) where bookable = true;
create index if not exists creator_profiles_service_area_idx
  on creator_profiles using gin (service_area) where bookable = true;
create index if not exists creator_profiles_content_style_idx
  on creator_profiles using gin (content_style) where bookable = true;

alter table creator_profiles enable row level security;

drop policy if exists "admin all creators"      on creator_profiles;
drop policy if exists "anyone reads bookable"   on creator_profiles;

create policy "admin all creators"
  on creator_profiles for all
  using (is_admin()) with check (is_admin());

/* Any authenticated user reads bookable rows. We don't gate by
   tenancy because the marketplace is intentionally cross-client —
   the same Maya appears for every restaurant who'd want her. */
create policy "anyone reads bookable"
  on creator_profiles for select
  using (bookable = true);

comment on table creator_profiles is
  'Bookable creators (food influencers, photographers, videographers). 1:1 with profiles.';

-- ─────────────────────────────────────────────────────────────────
-- booking_requests
-- ─────────────────────────────────────────────────────────────────
create table if not exists booking_requests (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references clients(id) on delete cascade,
  creator_id      uuid not null references auth.users(id) on delete cascade,
  requested_by    uuid not null references auth.users(id),
  /* What kind of engagement. Mirrors creator_profiles.category but
     stored on the request so it survives even if the creator changes
     focus later. */
  category        text not null
    check (category in ('food_influencer','photographer','videographer','other')),
  /* When the owner wants it to happen. Range or single date both work;
     we store start + optional end. */
  desired_start   date,
  desired_end     date,
  /* What it's for in plain English. */
  brief           text not null,
  /* Comp shape. Owner picks one + adds detail. */
  comp_type       text
    check (comp_type is null or comp_type in ('paid','meal_only','meal_plus_pay','barter','flexible')),
  comp_detail     text,
  status          text not null default 'open'
    check (status in ('open','in_discussion','quoted','confirmed','declined','withdrawn','completed')),
  /* Set by staff when they resolve the request. */
  resolved_at     timestamptz,
  resolved_by     uuid references auth.users(id),
  resolution_note text,
  /* Optional pointer to the deliverable (quote, calendar event) the
     strategist creates downstream. */
  quote_id        uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists booking_requests_client_open_idx
  on booking_requests (client_id, status)
  where status in ('open','in_discussion','quoted','confirmed');

create index if not exists booking_requests_creator_idx
  on booking_requests (creator_id);

alter table booking_requests enable row level security;

drop policy if exists "admin all bookings"   on booking_requests;
drop policy if exists "client reads bookings" on booking_requests;
drop policy if exists "client writes bookings" on booking_requests;

create policy "admin all bookings"
  on booking_requests for all
  using (is_admin()) with check (is_admin());

/* Clients see their own bookings. The booked creator does NOT see the
   row — staff negotiates the creator-side conversation offline. */
create policy "client reads bookings"
  on booking_requests for select
  using (client_id = current_client_id());

create policy "client writes bookings"
  on booking_requests for insert
  with check (client_id = current_client_id() and requested_by = auth.uid());

comment on table booking_requests is
  'Owner-initiated one-off booking requests for marketplace creators. Staff-mediated.';
