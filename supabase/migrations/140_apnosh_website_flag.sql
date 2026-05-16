-- Mark clients who are on the Apnosh-managed website service.
--
-- The website-editing tools (update_page_copy, update_menu_item) only
-- work when the client's site lives in an Apnosh GitHub repo with an
-- apnosh-content.json schema. This flag is the runtime gate: tools
-- refuse if it's false, regardless of tier.
--
-- Set to true by the Stripe webhook when a client subscribes to the
-- "Apnosh Website Hosting + AI Editing" product (metadata.apnosh_product
-- = 'website_hosting'). Reverted to false on cancellation.
--
-- Optional companion columns for traceability + admin tooling. Kept
-- nullable so the existing infrastructure (which tracks the repo in
-- site_settings) keeps working unchanged; these are convenience copies.

alter table clients add column if not exists has_apnosh_website boolean not null default false;
alter table clients add column if not exists website_repo_url text;
alter table clients add column if not exists website_started_at timestamptz;
