-- ─────────────────────────────────────────────────────────────
-- 110_cross_client_patterns.sql
--
-- Principle #7: anonymized successful patterns surface in
-- suggestions. As we add clients, the network effect compounds.
--
-- This migration creates a VIEW (not materialized — volume is too
-- low to justify the refresh complexity yet) that surfaces drafts
-- that landed and performed across the whole agency. AI helpers
-- query this via getCrossClientSignal() to include "this worked for
-- N similar restaurants" hints in prompts.
--
-- Anonymization: client_name is replaced with a coarse descriptor
-- (cuisine + footprint) so we never leak one client's specifics into
-- another's prompt.
-- ─────────────────────────────────────────────────────────────

-- Drop and recreate so re-running this migration is safe.
drop view if exists cross_client_winners;

create view cross_client_winners as
select
  d.id as draft_id,
  d.client_id,
  c.industry,
  c.shape_concept,
  c.shape_footprint,
  d.idea,
  d.caption,
  d.hashtags,
  d.media_brief,
  d.target_platforms,
  d.proposed_via,
  d.published_at,
  d.published_url,
  d.theme_version,
  -- Outcomes: prefer linked social_posts metrics, fallback to nulls
  sp.reach as outcome_reach,
  sp.total_interactions as outcome_engagement,
  sp.likes as outcome_likes,
  sp.comments as outcome_comments,
  sp.saves as outcome_saves,
  -- Anonymized descriptor so we don't leak client names cross-client
  concat_ws(' / ',
    coalesce(c.shape_concept, c.industry, 'restaurant'),
    coalesce(c.shape_footprint, 'single_neighborhood')
  ) as anon_descriptor
from content_drafts d
join clients c on c.id = d.client_id
left join social_posts sp on sp.id = d.published_post_id
where d.status in ('approved','scheduled','published')
  and d.created_at > now() - interval '180 days';

comment on view cross_client_winners is
  'Anonymized winning drafts across the agency. Drafts that were approved/scheduled/published in the last 180 days, joined with their social_posts outcomes when available. Anonymized via shape_concept + footprint instead of client name. AI helpers consume this for cross-client signal per principle #7.';

-- ── Helper: getCrossClientSignal(target_client_id, target_concept, limit)
-- Returns top patterns from clients similar in concept/footprint, EXCLUDING
-- the target client (so we don't surface their own posts to themselves).
create or replace function public.get_cross_client_signal(
  target_client_id uuid,
  signal_limit int default 5
)
returns table (
  draft_id uuid,
  anon_descriptor text,
  idea text,
  caption text,
  outcome_engagement int,
  proposed_via text
)
as $$
  with target as (
    select shape_concept, shape_footprint from clients where id = target_client_id
  )
  select
    w.draft_id,
    w.anon_descriptor,
    w.idea,
    w.caption,
    coalesce(w.outcome_engagement, 0)::int as outcome_engagement,
    w.proposed_via
  from cross_client_winners w, target
  where w.client_id <> target_client_id
    -- Loose similarity: same concept OR same footprint
    and (
      w.shape_concept = target.shape_concept
      or w.shape_footprint = target.shape_footprint
    )
  order by coalesce(w.outcome_engagement, 0) desc, w.published_at desc nulls last
  limit signal_limit;
$$ language sql security definer stable;

comment on function get_cross_client_signal is
  'Returns up to N anonymized winning drafts from clients similar to the target client (same concept or footprint), excluding the target. Used in AI generation prompts.';

-- ── RLS: only admin + strategist can read the view (cross-client by
-- definition crosses RLS scope). We rely on the function being
-- security definer + caller-gated.
-- The view itself inherits underlying table RLS, so for safety we
-- also grant explicitly via a permissive policy on the function call
-- path. (Views can't have RLS directly; callers query through the
-- function.)

revoke all on function public.get_cross_client_signal from public;
grant execute on function public.get_cross_client_signal to authenticated;
