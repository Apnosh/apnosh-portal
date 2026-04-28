-- ============================================================
-- Migration 070: capture restaurant-specific GBP metrics
-- ============================================================
-- GMB Insights monthly CSVs include "Food orders" and "Food menu
-- clicks" which we were dropping on the floor. These are the most
-- valuable downstream conversion metrics for restaurants -- a click
-- on the menu or an order placed via the GBP listing is closer to
-- revenue than a generic impression.
-- ============================================================

alter table gbp_metrics
  add column if not exists food_orders      integer not null default 0,
  add column if not exists food_menu_clicks integer not null default 0;

comment on column gbp_metrics.food_orders is
  'Orders placed via Google Business Profile listing (food-orders integration). Restaurant-only.';
comment on column gbp_metrics.food_menu_clicks is
  'Clicks on the GBP menu link. Strong intent signal for restaurants.';

notify pgrst, 'reload schema';
