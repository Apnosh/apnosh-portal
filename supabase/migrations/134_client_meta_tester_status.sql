-- Track Meta App tester invitation status per client.
-- Apnosh's Meta App runs in Development mode (Standard Access) for the
-- first ~100 clients so we don't need App Review yet. Each client must
-- first be added as a tester in the Meta App dashboard before they can
-- successfully OAuth their Instagram or Facebook account.
--
-- This table replaces ad-hoc spreadsheet tracking ("who have we invited?
-- who has accepted?") and powers the helper panel in the admin
-- ConnectionsTab so AMs can drive onboarding from one place.

create table if not exists client_meta_tester_status (
  client_id uuid primary key references clients(id) on delete cascade,

  -- Facebook App Tester role (covers Page + business analytics scopes).
  fb_tester_status text not null default 'not_invited'
    check (fb_tester_status in ('not_invited','invited','accepted','removed')),
  fb_tester_invited_at timestamptz,
  fb_tester_accepted_at timestamptz,
  -- Optional: Facebook user id once we know it (collected from OAuth).
  fb_user_id text,

  -- Instagram Tester (separate path required for Instagram Business API).
  ig_tester_status text not null default 'not_invited'
    check (ig_tester_status in ('not_invited','invited','accepted','removed')),
  ig_tester_invited_at timestamptz,
  ig_tester_accepted_at timestamptz,
  -- Instagram username this client uses; doubles as the input the IG
  -- testers API requires for invitation.
  ig_username text,

  -- Free-form notes the AM can leave on this client's onboarding.
  notes text,

  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Keep updated_at fresh on every change.
create or replace function set_meta_tester_status_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_meta_tester_status_updated_at on client_meta_tester_status;
create trigger trg_meta_tester_status_updated_at
  before update on client_meta_tester_status
  for each row execute function set_meta_tester_status_updated_at();

-- RLS: only Apnosh staff (admins) can read or write this table.
alter table client_meta_tester_status enable row level security;

drop policy if exists "admins manage meta tester status" on client_meta_tester_status;
create policy "admins manage meta tester status"
  on client_meta_tester_status
  for all
  to authenticated
  using (exists (
    select 1 from admin_users au where au.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from admin_users au where au.user_id = auth.uid()
  ));

comment on table client_meta_tester_status is
  'Per-client Meta App tester onboarding state. Tracks FB and IG tester invites + acceptances while the Apnosh Meta app is in Development mode (Standard Access). Drives the ConnectionsTab helper panel.';
