-- ─────────────────────────────────────────────────────────────
-- 109_draft_published_url.sql
--
-- Closes the lifecycle loop for content_drafts. When a draft is
-- published manually (e.g., strategist posts to Instagram from
-- their phone), we need somewhere to store the permalink — the
-- social_posts.id may not exist yet because the IG sync is
-- asynchronous.
--
-- Once the sync arrives, a separate job links published_post_id ←→
-- the draft via URL match. Until then, published_url holds the
-- evidence that the post went live.
-- ─────────────────────────────────────────────────────────────

alter table content_drafts
  add column if not exists published_url text;

comment on column content_drafts.published_url is
  'Permalink to the published post. Set when strategist manually marks a draft as published. social_posts.id may not exist yet — IG sync attaches published_post_id later by URL match.';
