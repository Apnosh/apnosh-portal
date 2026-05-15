-- Track which onboardings are "paused at step N" vs fully completed.
-- Apnosh's monetization is free portal + paid services, which means we
-- want self-serve signups to land in the portal as fast as possible
-- (after capturing the essentials) and continue the deeper profile
-- questions later. Setting onboarding_completed = true + onboarding_paused
-- = true unlocks portal access without losing the ability to nudge the
-- client to finish their profile.

alter table businesses
  add column if not exists onboarding_paused boolean not null default false;

comment on column businesses.onboarding_paused is
  'True when the owner used "Save and explore portal" mid-wizard. Dashboard surfaces a finish-your-profile banner; the next onboarding visit jumps to the step they left off at (businesses.onboarding_step).';
