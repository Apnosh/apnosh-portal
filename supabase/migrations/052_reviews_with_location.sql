-- ============================================================================
-- 052: reviews table (with multi-location support baked in)
-- ============================================================================
-- The reviews table was originally declared in migration 013 but was never
-- applied in production. This migration is the deployed definition and adds
-- a location_id column up front so multi-location clients can filter reviews
-- by specific location.
-- ============================================================================

CREATE TABLE IF NOT EXISTS reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  location_id uuid REFERENCES client_locations(id) ON DELETE SET NULL,

  source text NOT NULL CHECK (source IN ('google', 'yelp', 'facebook', 'tripadvisor', 'other')),
  external_id text,
  rating numeric(2, 1) NOT NULL CHECK (rating >= 1 AND rating <= 5),
  author_name text,
  author_avatar_url text,
  review_text text,
  review_url text,

  -- Response tracking
  response_text text,
  responded_at timestamptz,
  responded_by text,

  -- Flags
  flagged boolean NOT NULL DEFAULT false,
  flag_reason text,

  posted_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (client_id, source, external_id)
);

CREATE INDEX IF NOT EXISTS idx_reviews_client_posted ON reviews(client_id, posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_client_location ON reviews(client_id, location_id);
CREATE INDEX IF NOT EXISTS idx_reviews_client_flagged ON reviews(client_id) WHERE flagged = true;
CREATE INDEX IF NOT EXISTS idx_reviews_client_unresponded ON reviews(client_id) WHERE responded_at IS NULL;

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reviews_client_select" ON reviews
  FOR SELECT TO authenticated
  USING (
    client_id = current_client_id()
    OR client_id = current_user_client_id()
  );

CREATE POLICY "reviews_admin_all" ON reviews
  FOR ALL TO authenticated
  USING (is_admin());

COMMENT ON COLUMN reviews.location_id IS
  'Which client location this review is for. Null when the client is single-location or when attribution is unknown.';
