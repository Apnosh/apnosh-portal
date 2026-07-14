-- 209_catalog_analytics_addons — two more customer-facing card sections, editable in admin.
--
-- analytics: the metrics this card is built to lift, shown on the product page under
--   "Analytics to track" (["Google search views","Direction requests",...]). NULL = none.
-- add_ons:   card-level optional extras shown in the "Add ons" block, each with its own price
--   ([{ "label": "Extra photo set", "amount": 120, "kind": "one-time" }]). NULL = none.
--
-- Both nullable + backward-compatible: existing cards keep working unchanged.
alter table catalog_services
  add column if not exists analytics jsonb,
  add column if not exists add_ons  jsonb;

comment on column catalog_services.analytics is 'Customer-facing "Analytics to track" list (string[]). NULL = none.';
comment on column catalog_services.add_ons   is 'Card-level add-ons [{label,amount,kind}] shown in the "Add ons" block. NULL = none.';
