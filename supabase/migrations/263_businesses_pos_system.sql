-- ============================================================================
-- 263: what the business rings its sales up on
-- ============================================================================
-- The product can read Square and Clover. It cannot read Toast, and it cannot
-- read the older enterprise systems. Until now nothing recorded which one a
-- business actually uses, so the Orders stage showed every owner the same
-- "Connect your register" button -- including the ones whose register we have
-- no way to reach. An owner tapping Connect five times for a system that will
-- never appear is the complaint that came out of owner testing.
--
-- One column, set from onboarding. It does two jobs:
--   1. decides whether the Orders stage offers a Connect action or says plainly
--      that this register is not supported yet, and
--   2. measures real demand, so the decision to pursue a Toast partnership
--      rests on how many clients are on Toast rather than on market-share
--      headlines. Full service is the primary target and Toast owns that
--      segment, so this number matters commercially.
--
-- Deliberately free text with a CHECK, not an enum: adding a register later
-- should not need a type migration.
-- ============================================================================

alter table businesses
  add column if not exists pos_system text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'businesses_pos_system_check'
  ) then
    alter table businesses
      add constraint businesses_pos_system_check
      check (pos_system is null or pos_system in (
        'square', 'clover', 'toast', 'lightspeed', 'aloha', 'micros', 'other', 'none'
      ));
  end if;
end $$;

comment on column businesses.pos_system is
  'The register this business rings sales on, from onboarding. square and clover '
  || 'are readable today (adapters exist); toast is applied-for; the rest have no '
  || 'path. none = cash or no register. null = never asked. Read by the insights '
  || 'source resolver to decide whether the Orders stage offers Connect or says the '
  || 'register is not supported yet.';

notify pgrst, 'reload schema';
