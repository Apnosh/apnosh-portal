-- ─────────────────────────────────────────────────────────────
-- 188_catalog_deliverables.sql
--
-- Add the editable "what's included" field to the catalog: a plain summary + the concrete
-- deliverable bullets a client is paying for (e.g. for capture-kit: QR table tents, counter
-- cards, receipt inserts, offer wording, QR-to-list wiring). Shown on the service card and
-- editable in the admin. ADDITIVE — one nullable JSONB column, nothing else changes.
--
-- Shape: { "summary": text, "included": text[] }. The values are seeded separately (data, not
-- DDL) and ride into the generated snapshot via catalog-db-shape rowToService.
-- ─────────────────────────────────────────────────────────────

alter table catalog_services add column if not exists deliverables jsonb;
