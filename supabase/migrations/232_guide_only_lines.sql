-- Guide-only plan lines: the strategist may recommend what we cannot sell.
--
-- Laws 2 and 3 of the strategist-flow constitution (CLAUDE.md). Law 2, the orphan rule: a
-- genuinely useful move is never silently dropped because we cannot sell it -- it ships in the
-- plan as the owner's own move, with a real guide behind it. Law 3: `serviceable = false` is only
-- legal when that guide exists (enforced in code by the guide-moves sim, not here).
--
-- serviceable=false lines bill zero by construction (lineTotal), never mint work orders, and
-- carry a guide_key into src/lib/campaigns/data/guide-moves.ts, where the steps live as code so
-- they version with the product.
--
-- APPLY IN THE SUPABASE DASHBOARD SQL EDITOR, not the CLI.

alter table public.campaign_line_items
  add column if not exists serviceable boolean not null default true;

alter table public.campaign_line_items
  add column if not exists guide_key text;

comment on column public.campaign_line_items.serviceable is
  'False = a guide-only move: recommended, unbilled, done by the owner with our guide. Law 2/3.';
comment on column public.campaign_line_items.guide_key is
  'Key into the code-side GUIDE_MOVES record. Present exactly when serviceable = false.';
