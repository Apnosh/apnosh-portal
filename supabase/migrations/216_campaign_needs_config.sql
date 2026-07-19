-- 216_campaign_needs_config — owner control over the post-checkout "what we need from you" step.
--
-- Two parts:
-- 1) catalog_content_overrides.needs (jsonb): per-campaign config the owner edits in the campaign
--    builder — custom asks they write themselves, plus Required/Optional/Off overrides for the
--    auto-detected (service-driven) asks. Shape:
--      { "overrides": { "<askId>": "required" | "optional" | "off" },
--        "custom": [ { "id","title","why","inputType","options","required" } ] }
--    NULL = no owner config; the readiness page uses its smart defaults unchanged.
-- 2) campaigns.source_catalog_id (text): which catalog campaign an order was built from, so the
--    live readiness page can resolve the owner's config for THIS campaign. Set at create time;
--    NULL on older orders (readiness falls back to a goal-key map, else the smart defaults).
alter table catalog_content_overrides
  add column if not exists needs jsonb;

alter table campaigns
  add column if not exists source_catalog_id text;

comment on column catalog_content_overrides.needs is 'Owner config for the post-checkout "needs from you": { overrides: {askId: required|optional|off}, custom: [{id,title,why,inputType,options,required}] }. NULL = smart defaults.';
comment on column campaigns.source_catalog_id is 'Catalog campaign id this order was built from (e.g. gbp, reviewsplan), so readiness can apply the owner''s per-campaign needs config. NULL on legacy orders.';
