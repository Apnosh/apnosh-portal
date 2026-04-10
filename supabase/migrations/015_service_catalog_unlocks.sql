-- ============================================================
-- 015 — Service catalog → service area mapping
-- ------------------------------------------------------------
-- Tag each service_catalog item with which dashboard service
-- area it unlocks when purchased. Used by the Stripe webhook to
-- auto-set clients.services_active on payment.
-- ============================================================

ALTER TABLE service_catalog
  ADD COLUMN IF NOT EXISTS unlocks_service_area text
  CHECK (unlocks_service_area IN ('social', 'website', 'local_seo', 'email_sms'));

CREATE INDEX IF NOT EXISTS idx_service_catalog_unlocks
  ON service_catalog(unlocks_service_area)
  WHERE unlocks_service_area IS NOT NULL;

-- ── Backfill existing rows by category / id ──
-- Best-effort: any row whose category or id mentions one of the
-- four areas gets tagged. Admin can fine-tune in the catalog editor.

UPDATE service_catalog SET unlocks_service_area = 'social'
WHERE unlocks_service_area IS NULL
  AND (
    lower(category) LIKE '%social%' OR
    lower(id) LIKE '%social%' OR
    lower(name) LIKE '%social%' OR
    lower(name) LIKE '%instagram%' OR
    lower(name) LIKE '%tiktok%'
  );

UPDATE service_catalog SET unlocks_service_area = 'website'
WHERE unlocks_service_area IS NULL
  AND (
    lower(category) LIKE '%web%' OR
    lower(id) LIKE '%web%' OR
    lower(name) LIKE '%website%' OR
    lower(name) LIKE '%landing page%'
  );

UPDATE service_catalog SET unlocks_service_area = 'local_seo'
WHERE unlocks_service_area IS NULL
  AND (
    lower(category) LIKE '%seo%' OR
    lower(category) LIKE '%local%' OR
    lower(id) LIKE '%seo%' OR
    lower(id) LIKE '%gbp%' OR
    lower(name) LIKE '%seo%' OR
    lower(name) LIKE '%google business%' OR
    lower(name) LIKE '%gbp%'
  );

UPDATE service_catalog SET unlocks_service_area = 'email_sms'
WHERE unlocks_service_area IS NULL
  AND (
    lower(category) LIKE '%email%' OR
    lower(category) LIKE '%sms%' OR
    lower(id) LIKE '%email%' OR
    lower(id) LIKE '%sms%' OR
    lower(name) LIKE '%email%' OR
    lower(name) LIKE '%sms%' OR
    lower(name) LIKE '%newsletter%'
  );
