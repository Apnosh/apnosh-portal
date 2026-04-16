-- ============================================
-- Apnosh CRM Schema -- Complete Data Model
-- Migration: 043_crm_complete_schema
-- ============================================
--
-- This migration compares the spec against the live schema and only
-- adds what is missing. It never drops, renames, or restructures
-- existing tables or columns.
--
-- Existing tables that map to spec tables:
--   clients (008)           -> add missing columns
--   client_notes (002)      -> add missing columns (uses business_id, not client_id)
--   reviews (013)           -> add missing columns
--   team_members (020)      -> add missing columns
--   content_cycles (027)    -> already has all needed columns
--   content_templates (027) -> already complete
--   client_team_defaults (040) -> already complete
--   task_deliverables (040) -> already complete
--   task_notes (040)        -> already complete
--   production_share_links (038) -> already complete
--   social_metrics (026)    -> already complete
--   gbp_metrics (026)       -> already complete
--   benchmarks (026)        -> already complete
--   insights (026)          -> already complete
--   am_notes (026)          -> already complete
--
-- Existing tables that serve similar purpose but different structure:
--   social_connections (026) -> kept; channel_connections created as unified layer
--   gbp_connections (026)    -> kept; channel_connections created as unified layer
--   website_traffic (014)    -> kept (monthly, business_id); website_metrics created (daily, client_id)
--   email_campaigns (014)    -> kept; email_metrics created for aggregate campaign metrics
--
-- ============================================


-- ============================================
-- Section 1: Core tables
-- ============================================

-- 1a. clients -- add missing columns
-- Existing columns: id, name, slug, industry, location, website, primary_contact,
-- email, phone, socials, services_active, tier, monthly_rate, billing_status,
-- onboarding_date, notes, created_at, updated_at, allotments, goals,
-- target_audience, offerings, content_pillars, content_avoid, hashtag_sets,
-- cta_preferences, key_people, filming_locations, competitors, seasonal_notes,
-- content_defaults

ALTER TABLE clients ADD COLUMN IF NOT EXISTS business_name_display text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS business_subtype text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS account_type text DEFAULT 'managed';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS involvement_level text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS am_user_id uuid;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS plan_started_at timestamptz;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS referral_source text;

-- Add constraints via DO block (safe if already exists)
DO $$ BEGIN
  ALTER TABLE clients ADD CONSTRAINT clients_status_check
    CHECK (status IN ('pending','onboarding','active','paused','churned','declined'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE clients ADD CONSTRAINT clients_account_type_check
    CHECK (account_type IN ('managed','self_serve'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE clients ADD CONSTRAINT clients_involvement_level_check
    CHECK (involvement_level IN ('full_service','collaborative','hands_on'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- 1b. client_contacts -- NEW TABLE
CREATE TABLE IF NOT EXISTS client_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  -- Identity
  full_name text NOT NULL,
  email text,
  phone text,

  -- Role
  role text NOT NULL CHECK (role IN (
    'owner','manager','marketing_lead','employee','billing','filming_contact','other'
  )),
  is_primary boolean DEFAULT false,
  is_billing_contact boolean DEFAULT false,
  is_content_approver boolean DEFAULT false,

  -- Portal access
  user_id uuid,
  portal_role text CHECK (portal_role IN ('client_admin','client_member','client_viewer')),

  -- Preferences
  preferred_contact_method text CHECK (preferred_contact_method IN ('portal','email','phone','text')),
  best_time_to_reach text,

  -- Meta
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_contacts_client ON client_contacts(client_id);


-- 1c. client_locations -- NEW TABLE
CREATE TABLE IF NOT EXISTS client_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  -- Address
  location_name text,
  full_address text,
  street text,
  city text,
  state text,
  zip text,
  country text DEFAULT 'US',
  latitude numeric,
  longitude numeric,

  -- Operations
  hours jsonb,
  holiday_hours jsonb,
  parking_info text,
  seating_capacity integer,
  private_events boolean DEFAULT false,

  -- Filming logistics
  filming_available boolean DEFAULT true,
  filming_best_days text[],
  filming_best_times text,
  filming_contact_id uuid REFERENCES client_contacts(id),
  filming_access_notes text,
  equipment_on_site text,

  -- Status
  is_primary boolean DEFAULT true,
  is_active boolean DEFAULT true,

  -- GBP connection
  gbp_location_id text,
  gbp_place_id text,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_locations_client ON client_locations(client_id);


-- ============================================
-- Section 2: Brand and profile
-- ============================================

-- 2a. client_profiles -- NEW TABLE
-- Note: Some brand/profile data exists on businesses (041 onboarding fields),
-- clients (029 brand context), and client_brands (008/009). This table serves
-- as the canonical, unified brand profile going forward.
CREATE TABLE IF NOT EXISTS client_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE UNIQUE,

  -- About the business
  business_description text,
  unique_differentiator text,
  year_founded integer,
  price_range text CHECK (price_range IN ('$','$$','$$$','$$$$')),

  -- Food-specific
  cuisine text,
  cuisine_other text,
  service_styles text[],

  -- Audience
  customer_types text[],
  why_choose text[],
  customer_age_range text,

  -- Goals
  primary_goal text,
  goal_detail text,
  secondary_goals text[],
  success_signs text[],
  timeline text,
  previous_marketing text,

  -- What to promote
  main_offerings text,
  signature_items text[],
  upcoming_events text,
  seasonal_notes text,

  -- Brand voice
  tone_tags text[],
  avoid_tone_tags text[],
  custom_tone text,
  voice_notes text,

  -- Content preferences
  content_type_tags text[],
  content_pillars text[],
  avoid_content_tags text[],
  reference_accounts text,
  hashtag_strategy jsonb,
  emoji_usage text CHECK (emoji_usage IN ('heavy','moderate','light','none')),

  -- Workflow
  approval_type text CHECK (approval_type IN ('full','partial','minimal','rolling')),
  content_approval_turnaround text,
  can_film text[],
  can_tag text,
  can_reshare text,
  sensitive_topics text[],
  blackout_dates jsonb,

  -- Assets
  logo_url text,
  brand_color_primary text,
  brand_color_secondary text,
  brand_color_accent text,
  brand_fonts jsonb,
  brand_guidelines_url text,
  brand_drive text,

  -- Platforms
  platforms_connected jsonb,
  platforms_acknowledged text[],

  -- Onboarding
  user_role text,
  onboarding_complete boolean DEFAULT false,
  onboarding_step integer DEFAULT 1,
  agreed_terms boolean DEFAULT false,
  agreed_terms_at timestamptz,
  onboarding_completed_at timestamptz,

  -- Meta
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);


-- 2b. client_products -- NEW TABLE
CREATE TABLE IF NOT EXISTS client_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  -- Item
  name text NOT NULL,
  description text,
  category text,
  price numeric,
  price_display text,

  -- Status
  is_active boolean DEFAULT true,
  is_signature boolean DEFAULT false,
  is_seasonal boolean DEFAULT false,
  season text,
  available_from date,
  available_until date,

  -- Media
  photo_url text,

  -- Metadata
  sort_order integer DEFAULT 0,
  tags text[],

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_products_client ON client_products(client_id, is_active, sort_order);


-- 2c. client_competitors -- NEW TABLE
-- Note: competitors also stored as jsonb on clients.competitors (029) and
-- businesses.competitors (001). This table provides structured, queryable
-- competitor tracking. Existing jsonb columns remain untouched.
CREATE TABLE IF NOT EXISTS client_competitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  competitor_name text NOT NULL,
  business_type text,
  location text,
  website_url text,
  instagram_handle text,
  google_rating numeric,
  google_review_count integer,

  -- Positioning
  what_they_do_well text,
  how_client_is_different text,

  -- Meta
  notes text,
  last_checked_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_competitors_client ON client_competitors(client_id);


-- ============================================
-- Section 3: Content defaults and baselines
-- ============================================

-- 3a. client_content_defaults -- NEW TABLE
-- Note: clients.content_defaults jsonb (030) exists for simpler defaults.
-- This table provides a structured, column-based version.
CREATE TABLE IF NOT EXISTS client_content_defaults (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE UNIQUE,

  -- Design defaults
  default_mood text,
  default_color_preference text,
  default_include_logo boolean DEFAULT true,
  default_placement text,

  -- Video defaults
  default_editing_style text,
  default_music_feel text,
  default_subtitle_style text DEFAULT 'bold_centered',
  default_footage_source text DEFAULT 'we_film',
  default_video_length text,

  -- Copy defaults
  default_cta_type text,
  default_emoji_usage text,

  -- Scheduling defaults
  default_urgency text DEFAULT 'standard',

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);


-- 3b. client_baselines -- NEW TABLE
CREATE TABLE IF NOT EXISTS client_baselines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  platform text NOT NULL,
  metric_name text NOT NULL,
  metric_value numeric NOT NULL,
  captured_at timestamptz DEFAULT now(),
  captured_by uuid,

  UNIQUE(client_id, platform, metric_name)
);


-- ============================================
-- Section 4: Billing
-- ============================================

-- 4a. client_billing -- NEW TABLE
-- Note: Some billing data lives on businesses (stripe_customer_id) and
-- subscriptions table. This table provides a client-centric billing record.
CREATE TABLE IF NOT EXISTS client_billing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE UNIQUE,

  -- Plan
  plan_tier text,
  plan_price numeric,
  billing_frequency text CHECK (billing_frequency IN ('monthly','annual')),

  -- Stripe
  stripe_customer_id text,
  stripe_subscription_id text,
  payment_method_last4 text,
  payment_method_brand text,

  -- Contract
  contract_start_date date,
  contract_end_date date,
  founding_discount_pct integer,

  -- Deliverables
  deliverables jsonb,

  -- Add-ons
  addons jsonb,

  -- Billing contact
  billing_contact_id uuid REFERENCES client_contacts(id),

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);


-- ============================================
-- Section 5: Channel connections and metrics
-- ============================================

-- 5a. channel_connections -- NEW TABLE (unified layer)
-- social_connections and gbp_connections (026) are kept as-is.
-- This table provides a unified, multi-channel view going forward.
CREATE TABLE IF NOT EXISTS channel_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  -- Channel identity
  channel text NOT NULL,
  connection_type text NOT NULL CHECK (connection_type IN ('oauth','api_key','manual','csv_import','built_in')),

  -- Platform details
  platform_account_id text,
  platform_account_name text,
  platform_url text,

  -- Auth (NEVER expose client-side -- enforce in API layer)
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  scopes text[],

  -- Status
  status text DEFAULT 'pending' CHECK (status IN ('pending','active','error','disconnected')),
  last_sync_at timestamptz,
  sync_error text,

  -- Meta
  connected_by uuid,
  connected_at timestamptz DEFAULT now(),
  metadata jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_channel_connections_unique
  ON channel_connections(client_id, channel, COALESCE(platform_account_id, 'default'));

CREATE INDEX IF NOT EXISTS idx_channel_connections_client ON channel_connections(client_id, status);


-- 5b. website_metrics -- NEW TABLE (daily, client_id based)
-- Note: website_traffic (014) exists with monthly granularity and business_id.
-- This table provides daily metrics keyed by client_id.
CREATE TABLE IF NOT EXISTS website_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  date date NOT NULL,
  visitors integer DEFAULT 0,
  page_views integer DEFAULT 0,
  sessions integer DEFAULT 0,
  bounce_rate numeric,
  avg_session_duration integer,
  mobile_pct numeric,
  traffic_sources jsonb,
  top_pages jsonb,
  conversions jsonb,
  page_speed_score integer,
  raw_data jsonb,
  created_at timestamptz DEFAULT now(),
  UNIQUE(client_id, date)
);

CREATE INDEX IF NOT EXISTS idx_website_metrics_client_date ON website_metrics(client_id, date);


-- 5c. review_metrics -- NEW TABLE (daily aggregate per platform)
CREATE TABLE IF NOT EXISTS review_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  platform text NOT NULL,
  date date NOT NULL,
  rating_avg numeric,
  review_count integer,
  new_reviews integer DEFAULT 0,
  response_rate numeric,
  raw_data jsonb,
  created_at timestamptz DEFAULT now(),
  UNIQUE(client_id, platform, date)
);

CREATE INDEX IF NOT EXISTS idx_review_metrics_client_date ON review_metrics(client_id, date);


-- 5d. reviews -- add missing columns (only if table exists)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'reviews') THEN
    EXECUTE 'ALTER TABLE reviews ADD COLUMN IF NOT EXISTS sentiment text';
    EXECUTE 'ALTER TABLE reviews ADD COLUMN IF NOT EXISTS topics text[]';
  END IF;
END $$;


-- 5e. email_metrics -- NEW TABLE (aggregate campaign metrics)
-- Note: email_campaigns (014) stores individual campaigns with business_id.
-- This table provides aggregate metrics keyed by client_id.
CREATE TABLE IF NOT EXISTS email_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  campaign_id text,
  campaign_name text,
  sent_date date,
  sent_count integer DEFAULT 0,
  open_count integer DEFAULT 0,
  click_count integer DEFAULT 0,
  unsubscribe_count integer DEFAULT 0,
  open_rate numeric,
  click_rate numeric,
  revenue_attributed numeric,
  raw_data jsonb,
  created_at timestamptz DEFAULT now()
);


-- 5f. cross_channel_insights -- NEW TABLE
CREATE TABLE IF NOT EXISTS cross_channel_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  insight_text text NOT NULL,
  insight_type text,
  channels_involved text[] NOT NULL,
  priority integer DEFAULT 0,
  data_points jsonb,
  active boolean DEFAULT true,
  generated_at timestamptz DEFAULT now(),
  expires_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_cross_insights_client ON cross_channel_insights(client_id, active);


-- ============================================
-- Section 6: CRM notes, key dates, and client_notes alterations
-- ============================================

-- 6a. client_notes -- add missing columns (only if table exists)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'client_notes') THEN
    EXECUTE 'ALTER TABLE client_notes ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES clients(id) ON DELETE CASCADE';
    EXECUTE 'ALTER TABLE client_notes ADD COLUMN IF NOT EXISTS note_type text';
    EXECUTE 'ALTER TABLE client_notes ADD COLUMN IF NOT EXISTS title text';
    EXECUTE 'ALTER TABLE client_notes ADD COLUMN IF NOT EXISTS is_pinned boolean DEFAULT false';
    BEGIN
      EXECUTE 'ALTER TABLE client_notes ADD CONSTRAINT client_notes_note_type_check CHECK (note_type IN (''general'',''meeting'',''call'',''strategy'',''issue'',''win'',''feedback''))';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_client_notes_client_id ON client_notes(client_id, created_at DESC)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_client_notes_pinned ON client_notes(client_id, is_pinned, created_at DESC)';
  END IF;
END $$;


-- 6b. client_key_dates -- NEW TABLE
CREATE TABLE IF NOT EXISTS client_key_dates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  date_type text NOT NULL CHECK (date_type IN (
    'anniversary','birthday','seasonal_start','seasonal_end',
    'holiday_closure','event','launch','blackout','other'
  )),
  title text NOT NULL,
  date date,
  month integer,
  day integer,
  is_recurring boolean DEFAULT false,
  notes text,

  content_relevant boolean DEFAULT true,

  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_key_dates ON client_key_dates(client_id, date);


-- ============================================
-- Section 7: Team members -- add missing columns
-- ============================================

-- Existing (020/031/040): id, auth_user_id, name, email, avatar_url, role,
-- is_active, is_external, created_at
-- Spec adds freelancer-specific fields (only if table exists):
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'team_members') THEN
    EXECUTE 'ALTER TABLE team_members ADD COLUMN IF NOT EXISTS portfolio_links jsonb';
    EXECUTE 'ALTER TABLE team_members ADD COLUMN IF NOT EXISTS equipment text[]';
    EXECUTE 'ALTER TABLE team_members ADD COLUMN IF NOT EXISTS software text[]';
    EXECUTE 'ALTER TABLE team_members ADD COLUMN IF NOT EXISTS specialties text[]';
    EXECUTE 'ALTER TABLE team_members ADD COLUMN IF NOT EXISTS content_specialties text[]';
    EXECUTE 'ALTER TABLE team_members ADD COLUMN IF NOT EXISTS availability_hours_per_week integer';
    EXECUTE 'ALTER TABLE team_members ADD COLUMN IF NOT EXISTS geographic_area text';
    EXECUTE 'ALTER TABLE team_members ADD COLUMN IF NOT EXISTS rate_type text';
    EXECUTE 'ALTER TABLE team_members ADD COLUMN IF NOT EXISTS rate_amount numeric';
    EXECUTE 'ALTER TABLE team_members ADD COLUMN IF NOT EXISTS quality_tier text';
    EXECUTE 'ALTER TABLE team_members ADD COLUMN IF NOT EXISTS approval_status text DEFAULT ''approved''';
    EXECUTE 'ALTER TABLE team_members ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now()';
  END IF;
END $$;


-- ============================================
-- Section 8: Application pipeline
-- ============================================

CREATE TABLE IF NOT EXISTS applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  email text NOT NULL,
  business_name text NOT NULL,
  business_type text,
  city text,
  state text,
  plan_interest text,
  referral_source text,
  marketing_challenge text,
  status text DEFAULT 'submitted' CHECK (status IN (
    'submitted','in_review','approved','agreement_sent','paid','active','declined'
  )),
  resume_token text UNIQUE,
  agreement_token text UNIQUE,
  admin_notes text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  approved_at timestamptz,
  agreement_sent_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);


-- ============================================
-- Section 9: RLS policies
-- ============================================

-- Enable RLS on all new tables
ALTER TABLE client_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_competitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_content_defaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_billing ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE cross_channel_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_key_dates ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;

-- Helper: client read policies use both resolution paths
-- Path 1: current_client_id() via client_users
-- Path 2: current_user_client_id() via businesses.client_id

-- client_contacts
CREATE POLICY "client_contacts_client_select" ON client_contacts
  FOR SELECT TO authenticated
  USING (
    client_id = current_client_id()
    OR client_id = current_user_client_id()
  );

CREATE POLICY "client_contacts_admin_all" ON client_contacts
  FOR ALL TO authenticated
  USING (is_admin());

-- client_locations
CREATE POLICY "client_locations_client_select" ON client_locations
  FOR SELECT TO authenticated
  USING (
    client_id = current_client_id()
    OR client_id = current_user_client_id()
  );

CREATE POLICY "client_locations_admin_all" ON client_locations
  FOR ALL TO authenticated
  USING (is_admin());

-- client_profiles
CREATE POLICY "client_profiles_client_select" ON client_profiles
  FOR SELECT TO authenticated
  USING (
    client_id = current_client_id()
    OR client_id = current_user_client_id()
  );

CREATE POLICY "client_profiles_client_update" ON client_profiles
  FOR UPDATE TO authenticated
  USING (
    client_id = current_client_id()
    OR client_id = current_user_client_id()
  );

CREATE POLICY "client_profiles_admin_all" ON client_profiles
  FOR ALL TO authenticated
  USING (is_admin());

-- client_products
CREATE POLICY "client_products_client_select" ON client_products
  FOR SELECT TO authenticated
  USING (
    client_id = current_client_id()
    OR client_id = current_user_client_id()
  );

CREATE POLICY "client_products_admin_all" ON client_products
  FOR ALL TO authenticated
  USING (is_admin());

-- client_competitors
CREATE POLICY "client_competitors_client_select" ON client_competitors
  FOR SELECT TO authenticated
  USING (
    client_id = current_client_id()
    OR client_id = current_user_client_id()
  );

CREATE POLICY "client_competitors_admin_all" ON client_competitors
  FOR ALL TO authenticated
  USING (is_admin());

-- client_content_defaults
CREATE POLICY "client_content_defaults_client_select" ON client_content_defaults
  FOR SELECT TO authenticated
  USING (
    client_id = current_client_id()
    OR client_id = current_user_client_id()
  );

CREATE POLICY "client_content_defaults_admin_all" ON client_content_defaults
  FOR ALL TO authenticated
  USING (is_admin());

-- client_baselines
CREATE POLICY "client_baselines_client_select" ON client_baselines
  FOR SELECT TO authenticated
  USING (
    client_id = current_client_id()
    OR client_id = current_user_client_id()
  );

CREATE POLICY "client_baselines_admin_all" ON client_baselines
  FOR ALL TO authenticated
  USING (is_admin());

-- client_billing
CREATE POLICY "client_billing_client_select" ON client_billing
  FOR SELECT TO authenticated
  USING (
    client_id = current_client_id()
    OR client_id = current_user_client_id()
  );

CREATE POLICY "client_billing_admin_all" ON client_billing
  FOR ALL TO authenticated
  USING (is_admin());

-- channel_connections
-- CRITICAL: access_token and refresh_token must NEVER be returned client-side.
-- RLS is row-level only. Column filtering must happen in the API/server layer.
CREATE POLICY "channel_connections_client_select" ON channel_connections
  FOR SELECT TO authenticated
  USING (
    client_id = current_client_id()
    OR client_id = current_user_client_id()
  );

CREATE POLICY "channel_connections_admin_all" ON channel_connections
  FOR ALL TO authenticated
  USING (is_admin());

-- website_metrics
CREATE POLICY "website_metrics_client_select" ON website_metrics
  FOR SELECT TO authenticated
  USING (
    client_id = current_client_id()
    OR client_id = current_user_client_id()
  );

CREATE POLICY "website_metrics_admin_all" ON website_metrics
  FOR ALL TO authenticated
  USING (is_admin());

-- review_metrics
CREATE POLICY "review_metrics_client_select" ON review_metrics
  FOR SELECT TO authenticated
  USING (
    client_id = current_client_id()
    OR client_id = current_user_client_id()
  );

CREATE POLICY "review_metrics_admin_all" ON review_metrics
  FOR ALL TO authenticated
  USING (is_admin());

-- email_metrics
CREATE POLICY "email_metrics_client_select" ON email_metrics
  FOR SELECT TO authenticated
  USING (
    client_id = current_client_id()
    OR client_id = current_user_client_id()
  );

CREATE POLICY "email_metrics_admin_all" ON email_metrics
  FOR ALL TO authenticated
  USING (is_admin());

-- cross_channel_insights
CREATE POLICY "cross_channel_insights_client_select" ON cross_channel_insights
  FOR SELECT TO authenticated
  USING (
    client_id = current_client_id()
    OR client_id = current_user_client_id()
  );

CREATE POLICY "cross_channel_insights_admin_all" ON cross_channel_insights
  FOR ALL TO authenticated
  USING (is_admin());

-- client_key_dates
CREATE POLICY "client_key_dates_client_select" ON client_key_dates
  FOR SELECT TO authenticated
  USING (
    client_id = current_client_id()
    OR client_id = current_user_client_id()
  );

CREATE POLICY "client_key_dates_admin_all" ON client_key_dates
  FOR ALL TO authenticated
  USING (is_admin());

-- applications -- admin only (clients don't see the pipeline)
CREATE POLICY "applications_admin_all" ON applications
  FOR ALL TO authenticated
  USING (is_admin());


-- ============================================
-- Section 10: Indexes
-- ============================================

-- Common query patterns (only on tables that exist)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='social_metrics') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_social_metrics_client_date ON social_metrics(client_id, date)';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='gbp_metrics') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_gbp_metrics_client_date ON gbp_metrics(client_id, date)';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='reviews') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_reviews_client_date ON reviews(client_id, posted_at DESC)';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='insights') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_insights_client ON insights(client_id, view_type, active)';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='am_notes') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_am_notes_client ON am_notes(client_id, view_type, created_at DESC)';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='content_cycles') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_content_cycles_client ON content_cycles(client_id, month DESC)';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_email_metrics_client ON email_metrics(client_id, sent_date);


-- ============================================
-- Section 11: updated_at triggers for new tables
-- ============================================

-- Reuse existing set_updated_at() function
CREATE TRIGGER client_contacts_updated_at
  BEFORE UPDATE ON client_contacts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER client_locations_updated_at
  BEFORE UPDATE ON client_locations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER client_profiles_updated_at
  BEFORE UPDATE ON client_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER client_products_updated_at
  BEFORE UPDATE ON client_products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER client_content_defaults_updated_at
  BEFORE UPDATE ON client_content_defaults
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER client_billing_updated_at
  BEFORE UPDATE ON client_billing
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER applications_updated_at
  BEFORE UPDATE ON applications
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ============================================
-- Done. Summary of changes:
-- ============================================
-- ALTERED TABLES (added columns):
--   clients: +8 columns (business_name_display, business_subtype, status,
--            account_type, involvement_level, am_user_id, plan_started_at,
--            referral_source)
--   client_notes: +4 columns (client_id, note_type, title, is_pinned)
--   reviews: +2 columns (sentiment, topics)
--   team_members: +12 columns (freelancer fields)
--
-- NEW TABLES (15):
--   client_contacts, client_locations, client_profiles, client_products,
--   client_competitors, client_content_defaults, client_baselines,
--   client_billing, channel_connections, website_metrics, review_metrics,
--   email_metrics, cross_channel_insights, client_key_dates, applications
--
-- EXISTING TABLES KEPT AS-IS (no changes needed):
--   social_metrics, gbp_metrics, benchmarks, insights, am_notes,
--   content_cycles, content_templates, client_team_defaults,
--   task_deliverables, task_notes, production_share_links,
--   social_connections, gbp_connections, website_traffic, email_campaigns
