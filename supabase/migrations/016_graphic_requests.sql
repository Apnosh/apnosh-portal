-- ============================================================
-- 016 — Graphic request structured data
-- ------------------------------------------------------------
-- Stores all the structured fields a client fills out in the
-- multi-step graphic request wizard. Links 1:1 to a content_queue
-- row so the existing approve / draft / feedback / notification
-- flow continues to work — we just attach richer metadata.
-- ============================================================

CREATE TABLE IF NOT EXISTS graphic_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_queue_id uuid NOT NULL UNIQUE REFERENCES content_queue(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  submitted_by_user_id uuid REFERENCES client_users(id),
  submitted_at timestamptz NOT NULL DEFAULT now(),

  -- Step 1: Content type
  content_type text NOT NULL CHECK (content_type IN (
    'promo', 'product', 'event', 'seasonal', 'educational',
    'testimonial', 'bts', 'brand', 'other'
  )),

  -- Step 2: Dynamic detail fields (nullable — only populated for relevant types)
  offer_text text,
  promo_code text,
  offer_expiry text,
  price_display text,

  product_name text,
  product_desc text,
  product_price text,
  product_status text,

  event_name text,
  event_date text,
  event_time text,
  event_location text,
  event_ticket_info text,

  season_name text,
  season_message text,
  season_offer text,

  edu_topic text,
  edu_key_points text,

  testimonial_quote text,
  testimonial_name text,
  testimonial_source text,

  -- Step 3: Placement
  placement text CHECK (placement IN (
    'feed', 'story', 'reel-cover', 'carousel', 'banner', 'custom'
  )),
  carousel_slide_count int,
  custom_dim_mode text CHECK (custom_dim_mode IN ('ratio', 'px', 'in', 'cm')),
  custom_ratio text,
  custom_width numeric,
  custom_height numeric,
  custom_unit text,
  custom_dpi int,

  -- Step 4: Timing
  publish_date date,
  urgency text CHECK (urgency IN ('flexible', 'standard', 'urgent')),

  -- Step 5: Message (optional)
  main_message text,
  headline_text text,
  call_to_action text[],
  post_caption text,

  -- Step 6: Visuals (optional)
  uploaded_asset_urls text[] DEFAULT '{}',
  source_stock_photo boolean DEFAULT false,
  include_logo boolean DEFAULT true,

  -- Step 7: Style (optional)
  mood_tags text[] DEFAULT '{}',
  color_preference text,
  reference_link text,
  reference_asset_urls text[] DEFAULT '{}',

  -- Step 8: Avoid (optional)
  avoid_colors text,
  avoid_styles text,
  designer_notes text,
  internal_note text,  -- NEVER shown to designer or other clients

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_graphic_requests_client ON graphic_requests(client_id);
CREATE INDEX IF NOT EXISTS idx_graphic_requests_content_queue ON graphic_requests(content_queue_id);
CREATE INDEX IF NOT EXISTS idx_graphic_requests_content_type ON graphic_requests(content_type);

-- ── RLS ─────────────────────────────────────────────────────
ALTER TABLE graphic_requests ENABLE ROW LEVEL SECURITY;

-- Admins do anything
DROP POLICY IF EXISTS "Admins manage graphic_requests" ON graphic_requests;
CREATE POLICY "Admins manage graphic_requests" ON graphic_requests
  FOR ALL USING (is_admin());

-- Client portal users read their own
DROP POLICY IF EXISTS "Client reads own graphic_requests" ON graphic_requests;
CREATE POLICY "Client reads own graphic_requests" ON graphic_requests
  FOR SELECT USING (client_id = current_client_id());

-- Client portal users insert their own
DROP POLICY IF EXISTS "Client submits graphic_requests" ON graphic_requests;
CREATE POLICY "Client submits graphic_requests" ON graphic_requests
  FOR INSERT WITH CHECK (client_id = current_client_id());

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE graphic_requests;
