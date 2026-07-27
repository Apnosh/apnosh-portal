-- Give "Fill your slow nights" a distribution channel that actually works.
--
-- RUN THIS IN THE SUPABASE DASHBOARD SQL EDITOR, not the CLI. It is DML on a data table, not a
-- schema migration, and `supabase db push` would try to re-run the whole migration history.
--
-- WHY
-- social-mgmt (Instagram + Facebook posting, which src/lib/publish/ genuinely supports today) is
-- tagged only for the `firstvisit` goal. It has no `nights` play. So the composed slow-nights plan
-- reaches a stranger through exactly two things: 4 Google posts a month, and texts we cannot send
-- yet. For a campaign whose entire job is telling people about a Tuesday, that is the whole problem.
--
-- WHAT IT CHANGES FOR THE OWNER
-- Tier `standard` and up, matching how social-mgmt is already tiered on firstvisit. So:
--   lean start   unchanged. Still Google posts only, which is honest for the cheapest tier.
--   full plan    +$475/mo, and step 3 "Tell people it is on" gains a real second channel.
--   all-in       same +$475/mo.
-- It is a real price rise on the full plan, which is why this is a decision to sign off, not a
-- silent fix.
--
-- AFTER RUNNING: re-publish the frozen snapshot the composer reads, or the app will not see it:
--   npx tsx scripts/gen-catalog.ts
-- then commit the regenerated src/lib/campaigns/data/catalog.generated.ts.

update catalog_services
set goal_plays = coalesce(goal_plays, '[]'::jsonb) || jsonb_build_array(
      jsonb_build_object(
        'goal',    'nights',
        'stage',   'activate',
        'minTier', 'standard',
        'weight',  60,
        'role',    'Post the weeknight draw where your locals already scroll, and answer the people who ask about it.'
      )
    ),
    updated_at = now()
where id = 'social-mgmt'
  -- idempotent: re-running is a no-op, so this is safe to paste twice
  and not (coalesce(goal_plays, '[]'::jsonb) @> '[{"goal":"nights"}]'::jsonb);

-- Check it landed (expect one row, with a nights/activate/standard entry):
select id,
       jsonb_pretty(jsonb_path_query_array(goal_plays, '$[*] ? (@.goal == "nights")')) as nights_plays
from catalog_services
where id = 'social-mgmt';
