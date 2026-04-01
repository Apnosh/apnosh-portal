-- ============================================================
-- Apnosh Client Portal — Core Database Schema
-- ============================================================

-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- ── PROFILES ──
-- Extends Supabase auth.users with app-specific fields
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null default '',
  avatar_url text,
  role text not null default 'client' check (role in ('client', 'admin', 'team_member')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Auto-create profile on user signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'avatar_url', null)
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── BUSINESSES ──
create table businesses (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  industry text not null default '',
  description text,
  website_url text,
  phone text,
  locations jsonb not null default '[]',
  hours text,
  -- Brand Identity
  brand_voice_words jsonb not null default '[]',
  brand_tone text,
  brand_do_nots text,
  brand_colors jsonb not null default '{}',
  fonts text,
  style_notes text,
  -- Target Audience
  target_audience text,
  target_age_range text,
  target_location text,
  target_problem text,
  -- Competitors
  competitors jsonb not null default '[]',
  competitor_strengths text,
  differentiator text,
  -- Marketing Context
  current_platforms jsonb not null default '[]',
  posting_frequency text,
  has_google_business boolean default false,
  monthly_budget numeric,
  past_marketing_wins text,
  past_marketing_fails text,
  -- Goals & Preferences
  marketing_goals jsonb not null default '[]',
  content_topics text,
  content_avoid_topics text,
  additional_notes text,
  -- Seasonal
  seasonal_calendar jsonb not null default '[]',
  -- Stripe
  stripe_customer_id text unique,
  -- Metadata
  onboarding_completed boolean not null default false,
  onboarding_step integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_businesses_owner on businesses(owner_id);
create index idx_businesses_stripe on businesses(stripe_customer_id);

-- ── SERVICE CATALOG ──
create table service_catalog (
  id text primary key,
  name text not null,
  category text not null,
  description text not null default '',
  short_description text not null default '',
  price numeric not null,
  price_unit text not null check (price_unit in ('per_month', 'per_item', 'per_hour', 'one_time')),
  features jsonb not null default '[]',
  is_subscription boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  stripe_product_id text,
  stripe_price_id text,
  created_at timestamptz not null default now()
);

-- ── SUBSCRIPTIONS ──
create table subscriptions (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  plan_id text references service_catalog(id),
  plan_name text not null,
  plan_price numeric not null,
  billing_interval text not null default 'monthly' check (billing_interval in ('monthly', 'annually')),
  status text not null default 'active' check (status in ('active', 'paused', 'cancelled', 'past_due', 'trialing')),
  stripe_subscription_id text unique,
  stripe_customer_id text,
  started_at timestamptz not null default now(),
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz not null default (now() + interval '1 month'),
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_subscriptions_business on subscriptions(business_id);
create index idx_subscriptions_stripe on subscriptions(stripe_subscription_id);

-- ── ORDERS ──
create table orders (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  type text not null check (type in ('subscription', 'one_time', 'a_la_carte')),
  service_id text references service_catalog(id),
  service_name text not null,
  quantity integer not null default 1,
  unit_price numeric not null,
  total_price numeric not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled')),
  special_instructions text,
  deadline timestamptz,
  stripe_payment_intent_id text,
  stripe_checkout_session_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_orders_business on orders(business_id);
create index idx_orders_status on orders(status);

-- ── INVOICES ──
create table invoices (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  stripe_invoice_id text unique,
  amount numeric not null,
  status text not null default 'pending' check (status in ('paid', 'pending', 'failed', 'void', 'draft')),
  description text,
  invoice_url text,
  invoice_pdf text,
  period_start timestamptz,
  period_end timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_invoices_business on invoices(business_id);
create index idx_invoices_stripe on invoices(stripe_invoice_id);

-- ── WORK BRIEFS ──
create table work_briefs (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid not null references orders(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  brief_content jsonb not null default '{}',
  assigned_to uuid references profiles(id),
  assigned_to_name text,
  status text not null default 'pending' check (status in ('pending', 'assigned', 'in_progress', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_briefs_order on work_briefs(order_id);
create index idx_briefs_business on work_briefs(business_id);

-- ── DELIVERABLES ──
create table deliverables (
  id uuid primary key default uuid_generate_v4(),
  work_brief_id uuid references work_briefs(id) on delete set null,
  business_id uuid not null references businesses(id) on delete cascade,
  type text not null default 'other',
  title text not null,
  description text,
  content jsonb not null default '{}',
  file_urls jsonb not null default '[]',
  preview_urls jsonb not null default '[]',
  version integer not null default 1,
  status text not null default 'draft' check (status in ('draft', 'internal_review', 'client_review', 'revision_requested', 'approved', 'scheduled', 'published')),
  client_feedback text,
  revision_notes text,
  approved_at timestamptz,
  approved_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_deliverables_business on deliverables(business_id);
create index idx_deliverables_status on deliverables(status);

-- ── CONTENT CALENDAR ──
create table content_calendar (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  deliverable_id uuid references deliverables(id) on delete set null,
  platform text not null,
  title text not null,
  caption text,
  scheduled_at timestamptz not null,
  published_at timestamptz,
  post_url text,
  engagement_metrics jsonb not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'published', 'failed')),
  created_at timestamptz not null default now()
);

create index idx_calendar_business on content_calendar(business_id);
create index idx_calendar_scheduled on content_calendar(scheduled_at);

-- ── MESSAGE THREADS ──
create table message_threads (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  subject text not null,
  order_id uuid references orders(id),
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index idx_threads_business on message_threads(business_id);

-- ── MESSAGES ──
create table messages (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  thread_id uuid not null references message_threads(id) on delete cascade,
  sender_id uuid not null references profiles(id),
  sender_name text not null,
  sender_role text not null default 'client',
  content text not null,
  attachments jsonb not null default '[]',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_messages_thread on messages(thread_id);

-- ── NOTIFICATIONS ──
create table notifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  type text not null default 'system',
  title text not null,
  body text not null default '',
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_notifications_user on notifications(user_id);
create index idx_notifications_unread on notifications(user_id) where read_at is null;

-- ── ANALYTICS SNAPSHOTS ──
create table analytics_snapshots (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  platform text not null,
  date date not null,
  metrics jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index idx_analytics_business_date on analytics_snapshots(business_id, date);

-- ── BRAND ASSETS ──
create table brand_assets (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  type text not null default 'other',
  file_url text not null,
  thumbnail_url text,
  file_name text not null,
  file_size integer not null default 0,
  tags jsonb not null default '[]',
  uploaded_at timestamptz not null default now()
);

create index idx_assets_business on brand_assets(business_id);

-- ── PLATFORM CONNECTIONS ──
create table platform_connections (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  platform text not null,
  profile_url text,
  username text,
  access_token text,
  refresh_token text,
  connected_at timestamptz not null default now(),
  expires_at timestamptz,
  unique(business_id, platform)
);

create index idx_connections_business on platform_connections(business_id);

-- ══════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ══════════════════════════════════════════

alter table profiles enable row level security;
alter table businesses enable row level security;
alter table service_catalog enable row level security;
alter table subscriptions enable row level security;
alter table orders enable row level security;
alter table invoices enable row level security;
alter table work_briefs enable row level security;
alter table deliverables enable row level security;
alter table content_calendar enable row level security;
alter table message_threads enable row level security;
alter table messages enable row level security;
alter table notifications enable row level security;
alter table analytics_snapshots enable row level security;
alter table brand_assets enable row level security;
alter table platform_connections enable row level security;

-- Helper: check if user is admin
create or replace function public.is_admin()
returns boolean as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$$ language sql security definer;

-- Helper: get business IDs for current user
create or replace function public.user_business_ids()
returns setof uuid as $$
  select id from businesses where owner_id = auth.uid();
$$ language sql security definer;

-- PROFILES
create policy "Users can read own profile" on profiles for select using (id = auth.uid());
create policy "Users can update own profile" on profiles for update using (id = auth.uid());
create policy "Admins can read all profiles" on profiles for select using (is_admin());

-- BUSINESSES
create policy "Owners can read own business" on businesses for select using (owner_id = auth.uid());
create policy "Owners can update own business" on businesses for update using (owner_id = auth.uid());
create policy "Owners can insert business" on businesses for insert with check (owner_id = auth.uid());
create policy "Admins can do anything with businesses" on businesses for all using (is_admin());

-- SERVICE CATALOG (public read)
create policy "Anyone can read active services" on service_catalog for select using (is_active = true);
create policy "Admins can manage services" on service_catalog for all using (is_admin());

-- SUBSCRIPTIONS
create policy "Clients read own subscriptions" on subscriptions for select using (business_id in (select user_business_ids()));
create policy "Admins manage all subscriptions" on subscriptions for all using (is_admin());

-- ORDERS
create policy "Clients read own orders" on orders for select using (business_id in (select user_business_ids()));
create policy "Clients create own orders" on orders for insert with check (business_id in (select user_business_ids()));
create policy "Admins manage all orders" on orders for all using (is_admin());

-- INVOICES
create policy "Clients read own invoices" on invoices for select using (business_id in (select user_business_ids()));
create policy "Admins manage all invoices" on invoices for all using (is_admin());

-- WORK BRIEFS
create policy "Clients read own briefs" on work_briefs for select using (business_id in (select user_business_ids()));
create policy "Admins manage all briefs" on work_briefs for all using (is_admin());

-- DELIVERABLES
create policy "Clients read own deliverables" on deliverables for select using (business_id in (select user_business_ids()));
create policy "Clients update own deliverables" on deliverables for update using (business_id in (select user_business_ids()));
create policy "Admins manage all deliverables" on deliverables for all using (is_admin());

-- CONTENT CALENDAR
create policy "Clients read own calendar" on content_calendar for select using (business_id in (select user_business_ids()));
create policy "Admins manage all calendar" on content_calendar for all using (is_admin());

-- MESSAGE THREADS
create policy "Clients read own threads" on message_threads for select using (business_id in (select user_business_ids()));
create policy "Clients create threads" on message_threads for insert with check (business_id in (select user_business_ids()));
create policy "Admins manage all threads" on message_threads for all using (is_admin());

-- MESSAGES
create policy "Clients read own messages" on messages for select using (business_id in (select user_business_ids()));
create policy "Clients send messages" on messages for insert with check (business_id in (select user_business_ids()));
create policy "Admins manage all messages" on messages for all using (is_admin());

-- NOTIFICATIONS
create policy "Users read own notifications" on notifications for select using (user_id = auth.uid());
create policy "Users update own notifications" on notifications for update using (user_id = auth.uid());
create policy "Admins manage all notifications" on notifications for all using (is_admin());

-- ANALYTICS
create policy "Clients read own analytics" on analytics_snapshots for select using (business_id in (select user_business_ids()));
create policy "Admins manage all analytics" on analytics_snapshots for all using (is_admin());

-- BRAND ASSETS
create policy "Clients read own assets" on brand_assets for select using (business_id in (select user_business_ids()));
create policy "Clients upload assets" on brand_assets for insert with check (business_id in (select user_business_ids()));
create policy "Clients delete own assets" on brand_assets for delete using (business_id in (select user_business_ids()));
create policy "Admins manage all assets" on brand_assets for all using (is_admin());

-- PLATFORM CONNECTIONS
create policy "Clients read own connections" on platform_connections for select using (business_id in (select user_business_ids()));
create policy "Clients manage own connections" on platform_connections for all using (business_id in (select user_business_ids()));
create policy "Admins manage all connections" on platform_connections for all using (is_admin());

-- ══════════════════════════════════════════
-- UPDATED_AT TRIGGERS
-- ══════════════════════════════════════════

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_updated_at before update on profiles for each row execute function set_updated_at();
create trigger set_updated_at before update on businesses for each row execute function set_updated_at();
create trigger set_updated_at before update on subscriptions for each row execute function set_updated_at();
create trigger set_updated_at before update on orders for each row execute function set_updated_at();
create trigger set_updated_at before update on work_briefs for each row execute function set_updated_at();
create trigger set_updated_at before update on deliverables for each row execute function set_updated_at();
