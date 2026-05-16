-- Relax clients.tier check constraint to support agent tier slugs.
--
-- Background: migration 008 created clients.tier with the legacy values
-- ('Basic','Standard','Pro','Internal'). The agent system (src/lib/agent/tiers.ts)
-- uses lowercase slugs and adds a free-trial 'starter' tier. We accept all
-- legacy capitalized values plus the new lowercase slugs so existing rows
-- keep working and new subscriptions can write lowercase.
--
-- Also: normalize existing rows so resolveTier() always finds a match.

alter table clients drop constraint if exists clients_tier_check;

alter table clients add constraint clients_tier_check
  check (tier is null or tier in (
    -- legacy capitalized values (kept for backwards compatibility)
    'Basic', 'Standard', 'Pro', 'Internal',
    -- agent tier slugs (src/lib/agent/tiers.ts)
    'starter', 'basic', 'standard', 'pro'
  ));

-- Lowercase any existing capitalized tier values so all reads/writes
-- can rely on the slug form. Internal stays capitalized (no agent slug).
update clients set tier = lower(tier) where tier in ('Basic', 'Standard', 'Pro');
