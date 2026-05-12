-- Media URLs attached to a draft, ready for the publish step.
--
-- Until now, content_drafts only carried text (caption, hashtags) +
-- a media_brief describing what visuals should look like. The actual
-- asset URLs lived nowhere on the draft; visuals came from the
-- separate shoots/edits surfaces and were never linked back. To
-- auto-publish to Meta/LinkedIn/GBP we need the URLs on the draft.
--
-- Stored as text[] so a carousel post (multiple images) is a single
-- row, ordered. URLs can come from:
--  - Supabase Storage (client-assets bucket) via direct upload
--  - Any public URL (Drive direct, Cloudinary, S3) the strategist pastes
--
-- We don't enforce reachability at the DB layer; the publish gate in
-- application code does that just before sending to Meta.

alter table content_drafts
  add column if not exists media_urls text[] not null default '{}';

comment on column content_drafts.media_urls is
  'Ordered list of public image/video URLs ready for publishing. Empty until a strategist or photographer attaches assets.';
