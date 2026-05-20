-- Marketplace v2: vendors + listings.
--
-- Turns the creator-only marketplace into a multi-category vendor
-- marketplace where Apnosh-the-agency is one vendor among many.
--
-- New tables:
--   vendors          — companies or individuals that offer services
--   vendor_listings  — bookable items under a vendor (bundles, shoots,
--                      packages, services)
--
-- Migrates existing creator_profiles to also point at a vendor row
-- (auto-created during backfill). Existing booking_requests stay
-- working via creator_id, with optional new vendor_id / listing_id
-- fields for new bookings.
--
-- Apnosh seeded as the first vendor with 4 bundle listings drawn
-- from src/data/packages-data.json. Geographic scope is Washington
-- per current product direction.

-- ─────────────────────────────────────────────────────────────────
-- vendors
-- ─────────────────────────────────────────────────────────────────
create table if not exists vendors (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  /* 'individual' = solo creator/freelancer (linked to person_id).
     'company'    = third-party agency or business.
     'apnosh'     = the Apnosh-owned listing. Used for 0% platform fee
                    and "Apnosh Verified" badge logic. */
  vendor_type text not null check (vendor_type in ('individual','company','apnosh')),
  person_id uuid references auth.users(id) on delete set null,
  description text,
  logo_url text,
  cover_url text,
  service_area text[] not null default '{WA}',
  /* Tier: 'free' (basic listing), 'pro' (paid placement),
     'verified' (vetted third-party), 'apnosh' (us). */
  tier text not null default 'free' check (tier in ('free','pro','verified','apnosh')),
  is_apnosh boolean not null default false,
  verified boolean not null default false,
  /* Aggregate rating (1-5), computed nightly from reviews. */
  avg_rating numeric(3,2),
  total_bookings int not null default 0,
  /* Platform fee % charged on bookings. Apnosh = 0, free tier = 20,
     pro tier = 15, verified = 12. */
  platform_fee_percent numeric(5,2) not null default 20.00,
  bookable boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vendors_bookable_idx
  on vendors (bookable) where bookable = true;
create index if not exists vendors_tier_idx
  on vendors (tier) where bookable = true;
create index if not exists vendors_service_area_idx
  on vendors using gin (service_area) where bookable = true;

alter table vendors enable row level security;

drop policy if exists "admin all vendors" on vendors;
drop policy if exists "anyone reads bookable vendors" on vendors;

create policy "admin all vendors"
  on vendors for all
  using (is_admin()) with check (is_admin());

/* Public read of bookable vendors. Public marketplace pages
   (/marketplace/[slug]) need this to render without auth. */
create policy "anyone reads bookable vendors"
  on vendors for select
  using (bookable = true);

comment on table vendors is
  'Marketplace vendors: companies or individuals offering restaurant services. Apnosh is the first vendor.';

-- ─────────────────────────────────────────────────────────────────
-- vendor_listings
-- ─────────────────────────────────────────────────────────────────
create table if not exists vendor_listings (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors(id) on delete cascade,
  slug text not null,
  title text not null,
  /* Category aligned with creator_profiles.category but expanded. */
  category text not null check (category in (
    'food_influencer','photographer','videographer',
    'graphic_designer','web_designer','social_manager',
    'local_seo','email_marketer','pr_specialist',
    'strategist','full_service_agency','other'
  )),
  /* 'subscription' = recurring (Apnosh bundles).
     'one_off'      = single deliverable (one shoot).
     'package'      = mini multi-deliverable package from a third party.
     'quote'        = quote-based, no fixed price. */
  listing_type text not null check (listing_type in ('subscription','one_off','package','quote')),
  description text,
  /* Price in cents. NULL = quote-based. */
  price_cents int,
  /* For subscriptions: billing period. */
  billing_period text check (billing_period is null or billing_period in ('monthly','annual','one_time')),
  /* Structured spec (matches packages-data.json shape for bundles).
     Free-form for third-party listings. */
  details jsonb,
  display_order int not null default 0,
  featured boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vendor_id, slug)
);

create index if not exists vendor_listings_vendor_idx
  on vendor_listings (vendor_id) where active = true;
create index if not exists vendor_listings_category_idx
  on vendor_listings (category) where active = true;
create index if not exists vendor_listings_featured_idx
  on vendor_listings (featured, display_order) where active = true and featured = true;

alter table vendor_listings enable row level security;

drop policy if exists "admin all listings" on vendor_listings;
drop policy if exists "anyone reads active listings" on vendor_listings;

create policy "admin all listings"
  on vendor_listings for all
  using (is_admin()) with check (is_admin());

create policy "anyone reads active listings"
  on vendor_listings for select
  using (active = true);

comment on table vendor_listings is
  'Bookable items under a vendor. For Apnosh: each bundle. For creators: each service offering.';

-- ─────────────────────────────────────────────────────────────────
-- Extend creator_profiles + booking_requests categories
-- ─────────────────────────────────────────────────────────────────
alter table creator_profiles drop constraint if exists creator_profiles_category_check;
alter table creator_profiles add constraint creator_profiles_category_check
  check (category in (
    'food_influencer','photographer','videographer',
    'graphic_designer','web_designer','social_manager',
    'local_seo','email_marketer','pr_specialist',
    'strategist','full_service_agency','other'
  ));

alter table creator_profiles add column if not exists vendor_id uuid references vendors(id);

alter table booking_requests drop constraint if exists booking_requests_category_check;
alter table booking_requests add constraint booking_requests_category_check
  check (category in (
    'food_influencer','photographer','videographer',
    'graphic_designer','web_designer','social_manager',
    'local_seo','email_marketer','pr_specialist',
    'strategist','full_service_agency','other'
  ));

alter table booking_requests add column if not exists vendor_id uuid references vendors(id);
alter table booking_requests add column if not exists listing_id uuid references vendor_listings(id);
/* Existing rows reference creator_id; new vendor-based bookings won't.
   Make creator_id nullable so company-vendor bookings work. */
alter table booking_requests alter column creator_id drop not null;

-- ─────────────────────────────────────────────────────────────────
-- Seed: Apnosh as the first vendor
-- ─────────────────────────────────────────────────────────────────
insert into vendors (
  slug, name, vendor_type, description, tier, is_apnosh, verified,
  platform_fee_percent, bookable, service_area, logo_url
)
values (
  'apnosh',
  'Apnosh',
  'apnosh',
  'Full-service marketing for restaurants. AI-powered, restaurant-specialized, transparent pricing.',
  'apnosh',
  true,
  true,
  0,
  true,
  '{WA}',
  '/apnosh-logo.svg'
)
on conflict (slug) do nothing;

-- ─────────────────────────────────────────────────────────────────
-- Seed: 4 Apnosh bundle listings
-- ─────────────────────────────────────────────────────────────────
with apnosh as (
  select id from vendors where slug = 'apnosh'
)
insert into vendor_listings (
  vendor_id, slug, title, category, listing_type,
  description, price_cents, billing_period, details,
  display_order, featured, active
)
select id, 'starter-plate', 'Starter Plate', 'full_service_agency', 'subscription',
       'Get found. We make sure you show up #1 when locals search for your food, with photos that make them hungry and reviews that make them trust you.',
       29900, 'monthly',
       jsonb_build_object(
         'stage', 'Get Found',
         'tagline', 'We get you on Google Maps, fill your Instagram, and handle your hours updates everywhere — so you can focus on the food.',
         'firstMonthFree', true,
         'setup', 0,
         'onboardingValue', 2599,
         'popular', true
       ),
       1, true, true
  from apnosh
on conflict (vendor_id, slug) do nothing;

with apnosh as (
  select id from vendors where slug = 'apnosh'
)
insert into vendor_listings (
  vendor_id, slug, title, category, listing_type,
  description, price_cents, billing_period, details,
  display_order, featured, active
)
select id, 'full-plate', 'Full Plate', 'full_service_agency', 'subscription',
       'Grow your audience. Monthly content shoots, reels, email, and a website that converts.',
       59900, 'monthly',
       jsonb_build_object(
         'stage', 'Grow Your Audience',
         'tagline', 'Once you''re getting found, we help you grow a real audience.',
         'firstMonthFree', true,
         'setup', 0,
         'onboardingValue', 5997,
         'popular', false
       ),
       2, true, true
  from apnosh
on conflict (vendor_id, slug) do nothing;

with apnosh as (
  select id from vendors where slug = 'apnosh'
)
insert into vendor_listings (
  vendor_id, slug, title, category, listing_type,
  description, price_cents, billing_period, details,
  display_order, featured, active
)
select id, 'chefs-counter', 'Chef''s Counter', 'full_service_agency', 'subscription',
       'Become a destination. Full brand refresh, premium content, dedicated strategist.',
       129900, 'monthly',
       jsonb_build_object(
         'stage', 'Become a Destination',
         'tagline', 'For restaurants ready to become the neighborhood destination.',
         'firstMonthFree', true,
         'setup', 49900,
         'onboardingValue', 13695,
         'popular', false
       ),
       3, true, true
  from apnosh
on conflict (vendor_id, slug) do nothing;

with apnosh as (
  select id from vendors where slug = 'apnosh'
)
insert into vendor_listings (
  vendor_id, slug, title, category, listing_type,
  description, price_cents, billing_period, details,
  display_order, featured, active
)
select id, 'the-empire', 'The Empire', 'full_service_agency', 'subscription',
       'Dominate your market. Total marketing infrastructure for multi-location operators and category leaders.',
       299900, 'monthly',
       jsonb_build_object(
         'stage', 'Dominate Your Market',
         'tagline', 'Total marketing infrastructure for multi-location operators and category leaders.',
         'firstMonthFree', true,
         'setup', 99900,
         'onboardingValue', 33493,
         'popular', false
       ),
       4, true, true
  from apnosh
on conflict (vendor_id, slug) do nothing;

-- ─────────────────────────────────────────────────────────────────
-- Backfill: auto-create a vendor row for every existing creator_profile
-- ─────────────────────────────────────────────────────────────────
insert into vendors (
  slug, name, vendor_type, person_id, description,
  tier, platform_fee_percent, bookable, service_area
)
select
  /* Slug from person_id (short prefix). Profiles likely have a display
     name we can use — fall back to person_id otherwise. */
  'creator-' || substring(cp.person_id::text from 1 for 8),
  coalesce(p.first_name || ' ' || p.last_name, 'Creator'),
  'individual',
  cp.person_id,
  null,
  'free',
  20.00,
  cp.bookable,
  cp.service_area
from creator_profiles cp
left join profiles p on p.id = cp.person_id
where cp.vendor_id is null
on conflict (slug) do nothing;

/* Link creator_profiles.vendor_id to the new vendor rows. */
update creator_profiles cp
set vendor_id = v.id
from vendors v
where v.person_id = cp.person_id
  and cp.vendor_id is null;
