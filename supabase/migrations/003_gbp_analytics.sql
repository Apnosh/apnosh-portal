-- ============================================================
-- 003: GBP Analytics & Agency Settings
-- Adds Google Business Profile monthly data tracking,
-- agency settings for report branding, and column mapping
-- ============================================================

-- GBP Monthly Data (mirrors Lovable's monthly_data table)
create table if not exists gbp_monthly_data (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  month integer not null check (month between 1 and 12),
  year integer not null check (year between 2000 and 2100),
  -- Discovery metrics
  search_mobile integer default 0,
  search_desktop integer default 0,
  maps_mobile integer default 0,
  maps_desktop integer default 0,
  -- Interaction metrics
  calls integer default 0,
  messages integer default 0,
  bookings integer default 0,
  directions integer default 0,
  website_clicks integer default 0,
  -- Industry-specific
  food_orders integer default 0,
  food_menu_clicks integer default 0,
  hotel_bookings integer default 0,
  created_at timestamptz not null default now(),
  -- One row per business per month
  unique(business_id, month, year)
);

create index idx_gbp_business_period on gbp_monthly_data(business_id, year, month);

-- Agency Settings (single row for report branding & preferences)
create table if not exists agency_settings (
  id uuid primary key default uuid_generate_v4(),
  agency_name text default 'Apnosh',
  logo_url text,
  contact_name text,
  contact_email text,
  website_url text default 'https://www.apnosh.com',
  report_defaults jsonb default '{
    "showPerformanceHighlights": true,
    "showAreasOfAttention": true,
    "showNextSteps": true,
    "showSeoRecommendations": true,
    "showCharts": true
  }'::jsonb,
  preferences jsonb default '{
    "activeMetrics": ["search_mobile","search_desktop","maps_mobile","maps_desktop","calls","messages","bookings","directions","website_clicks","food_orders","food_menu_clicks"],
    "defaultPeriod": 6
  }'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Add column_mapping to businesses table for per-client Excel mapping
alter table businesses add column if not exists gbp_column_mapping jsonb default null;

-- ── RLS Policies ──

alter table gbp_monthly_data enable row level security;
alter table agency_settings enable row level security;

-- GBP data: clients read own, admins manage all
create policy "Clients read own GBP data" on gbp_monthly_data
  for select using (business_id in (select id from businesses where owner_id = auth.uid()));

create policy "Admins manage all GBP data" on gbp_monthly_data
  for all using (is_admin());

-- Agency settings: admins only
create policy "Admins manage agency settings" on agency_settings
  for all using (is_admin());

create policy "Anyone can read agency settings" on agency_settings
  for select using (true);

-- Insert default agency settings row
insert into agency_settings (agency_name, contact_email, website_url)
values ('Apnosh', 'hello@apnosh.com', 'https://www.apnosh.com')
on conflict do nothing;
