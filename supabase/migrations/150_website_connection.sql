-- Connect an owner's OWN external website (Vercel/GitHub) so business
-- info syncs to it.
--
-- Distinct from has_apnosh_website (Apnosh-provisioned sites that read
-- from our DB). These columns describe a client-owned GitHub repo we
-- commit an apnosh-content.json into; their Vercel project auto-deploys
-- on the commit and their site reads the JSON.
--
-- Write access: the Apnosh GitHub PAT (APNOSH_GITHUB_PAT) must be able
-- to write to the repo — the connect flow verifies this before saving.

alter table clients add column if not exists website_content_repo   text;   -- "owner/name"
alter table clients add column if not exists website_content_path    text default 'apnosh-content.json';
alter table clients add column if not exists website_content_branch  text default 'main';
alter table clients add column if not exists website_connected_at    timestamptz;
alter table clients add column if not exists website_last_synced_at  timestamptz;

comment on column clients.website_content_repo is
  'GitHub "owner/name" of the client''s own website repo. When set, business-info saves commit apnosh-content.json here and Vercel auto-deploys.';
