-- ============================================================
-- Service Areas, Content Formats, Allotments, Asset Folders
-- ============================================================
-- Reorganizes the client portal around 4 service areas:
-- social, website, local_seo, email_sms
--
-- Adds:
-- - content_queue.service_area (which tab a request belongs to)
-- - content_queue.content_format (specific type within service area)
-- - clients.allotments (monthly limits per service area)
-- - client_assets.folder (simple folder organization)

-- ── 1. content_queue: service_area + content_format ──────────
ALTER TABLE content_queue
  ADD COLUMN IF NOT EXISTS service_area text
    CHECK (service_area IN ('social', 'website', 'local_seo', 'email_sms'));

ALTER TABLE content_queue
  ADD COLUMN IF NOT EXISTS content_format text
    CHECK (content_format IN (
      'feed_post', 'reel', 'carousel', 'story',
      'blog_post', 'page_update', 'bug_fix',
      'gbp_post', 'review_response', 'citation_update',
      'email_campaign', 'sms_blast', 'newsletter',
      'custom'
    ));

-- Backfill: existing requests are all social (that's all we had before)
UPDATE content_queue
SET service_area = 'social'
WHERE service_area IS NULL;

-- Now enforce NOT NULL for new rows
ALTER TABLE content_queue
  ALTER COLUMN service_area SET DEFAULT 'social';

CREATE INDEX IF NOT EXISTS idx_content_queue_service_area
  ON content_queue(client_id, service_area);

-- ── 2. clients: monthly allotments ───────────────────────────
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS allotments jsonb NOT NULL DEFAULT '{}';

-- Seed default for Apnosh test client
UPDATE clients
SET allotments = jsonb_build_object(
  'social_posts_per_month', 12,
  'website_changes_per_month', 5,
  'seo_updates_per_month', 8,
  'email_campaigns_per_month', 4
)
WHERE slug = 'apnosh' AND (allotments = '{}' OR allotments IS NULL);

-- ── 3. client_assets: folder organization ───────────────────
ALTER TABLE client_assets
  ADD COLUMN IF NOT EXISTS folder text;

CREATE INDEX IF NOT EXISTS idx_client_assets_folder
  ON client_assets(client_id, folder);
