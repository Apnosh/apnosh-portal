-- Multi-skill creators + richer profile fields.
--
-- A freelancer can do several things (a photographer who also shoots video and runs social), so
-- their skills become a LIST instead of the single scalar `craft`. We keep the scalar `craft`
-- (the coarse campaign-router dispatch key, CHECK Video/Photo/Social/Design) as the PRIMARY skill
-- for back-compat, and add `crafts` as the full set. Mirrors the existing `service_area text[]`
-- idiom (default + GIN index + array containment reads).
--
-- Also adds two profile fields the guided freelancer onboarding collects: `style_tags` (aesthetic
-- tags for match) and `portfolio_links` (links to their work until image upload lands).
--
-- Skill ids in `crafts` use the onboarding vocabulary (photo/video/social/design/web/marketing/
-- writing, see creator-skills.ts) — a finer list than the 4-value scalar craft. The campaign router
-- widens to match any of a creator's skills via array overlap (see lib/campaigns/vendor-supply.ts).

alter table vendors add column if not exists crafts text[] not null default '{}';
alter table vendors add column if not exists style_tags text[] not null default '{}';
alter table vendors add column if not exists portfolio_links text[] not null default '{}';

create index if not exists idx_vendors_crafts on vendors using gin (crafts);

-- Backfill: seed the skills list from the existing scalar craft (lowercased to the skill-id form)
-- for creators that predate this column, so nobody loses their single craft.
update vendors
   set crafts = array[lower(craft)]
 where craft is not null and (crafts is null or crafts = '{}');

-- Direct PostgREST reads by anon/authenticated go through a column GRANT allow-list (migration 199);
-- the app reads vendors via the service-role admin client (which bypasses grants), but grant the new
-- display columns too so any future public read can see them.
grant select (crafts, style_tags, portfolio_links) on vendors to anon, authenticated;
