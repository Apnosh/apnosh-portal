-- 220_catalog_campaigns_needs — let ADMIN-CREATED (DB) campaigns configure the post-checkout
-- "what we need from you" step, same as built-in campaigns already can (closes gap G10).
--
-- Built-in campaigns store their needs config on catalog_content_overrides.needs (migration 216); DB
-- campaigns had no equivalent, so a needs config authored for one was silently dropped. This adds the
-- column so the readiness page can resolve a DB campaign's needs by its source_catalog_id too.
--
-- (gates jsonb was already added to catalog_campaigns by migration 218.)
-- Owner runs this in Supabase. Code degrades if it isn't applied yet: the catalog-campaigns save
-- strips needs on the missing-column error, so authoring still works (the config just won't persist
-- until this lands), and readiness falls back to its smart defaults.

alter table catalog_campaigns
  add column if not exists needs jsonb;

comment on column catalog_campaigns.needs is 'Owner config for the post-checkout "needs from you" step (same shape as catalog_content_overrides.needs). NULL = smart defaults.';

notify pgrst, 'reload schema';
