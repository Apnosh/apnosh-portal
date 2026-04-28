-- ============================================================
-- Migration 067: track when admin emailed a client to add Apnosh
-- as a Manager on their Google Business Profile
-- ============================================================
-- Pattern A onboarding: every new restaurant client needs to add
-- apnosh@gmail.com as a Manager on their GBP listing for our agency
-- token to see their data. We surface this as a UI status (pending /
-- connected / lost) on each client tab. This column captures the
-- moment the admin sent the onboarding email so we can:
--   - hide the Send Invite button after it's been clicked
--   - show "invite sent X days ago" on stale onboardings
--   - drive a reminder workflow at 7 / 14 / 30 days
-- ============================================================

alter table clients
  add column if not exists gbp_invite_sent_at timestamptz;

comment on column clients.gbp_invite_sent_at is
  'When admin last sent the GBP-Manager onboarding email to this client. Null = not sent. Used to drive the per-client GBP connection status badge.';

-- Reload PostgREST schema cache
notify pgrst, 'reload schema';
