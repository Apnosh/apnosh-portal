-- Migration 233 — the requirement vault: collect once, forever.
-- (Promoted verbatim from supabase/manual/2026-07-27-requirement-vault.sql, now deleted.)
--
-- Every setup card names the requirement ids it needs (src/lib/campaigns/setup/requirements.ts).
-- Four cards between them ask for the Google connection eight times. The owner should connect
-- Google once, and every card after that should already know.
--
-- WHAT THIS TABLE IS NOT. It is not where credentials live. Tokens stay where they already are
-- (google_connections and friends); this table records only THAT a requirement is satisfied, how
-- we know, and when. `value` is for small owner-typed facts (a phone number, an address line),
-- never for a secret.
--
-- THE PROOF COLUMN IS THE POINT. `proof` mirrors the ladder the code already keeps:
--   token      we hold a working credential
--   probe      an independent machine check passed
--   our-side   we did it ourselves and it worked
--   owner-word the owner said so
-- Only the last one is writable by the owner, exactly like the claimed-vs-verified execution
-- columns. A row proved by the owner's word renders as a hollow check and never as a solid one,
-- so nothing on screen can quietly launder a claim into a fact.
--
-- APPLY THIS IN THE SUPABASE DASHBOARD SQL EDITOR, not the CLI.

create table if not exists public.client_requirements (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients(id) on delete cascade,

  -- The requirement id from the library. Text rather than an enum: the library grows every time a
  -- service is finished, and a migration per requirement would be nine migrations of ceremony.
  requirement   text not null,

  proof         text not null check (proof in ('token','probe','our-side','owner-word')),

  -- Small owner-typed facts only. Never a secret, never a token.
  value         jsonb,

  -- How we know, in a sentence, for the audit trail: "Google API returned the profile",
  -- "owner pressed I did this".
  evidence      text,

  satisfied_at  timestamptz not null default now(),
  -- Set when something we relied on stops being true: a token expires, a probe fails on recheck.
  -- Kept rather than deleted so the history of what we once had is not lost.
  broken_at     timestamptz,
  broken_reason text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- One row per requirement per client. This constraint IS "collect once".
  unique (client_id, requirement)
);

create index if not exists client_requirements_client_idx
  on public.client_requirements (client_id)
  where broken_at is null;

-- RLS on, admin-only policy, same as campaign_payments / bookings / availability_rules. Every owner
-- read and write goes through a server route on the service role, which is the house pattern and
-- also the only place the proof rung can be enforced honestly: the route decides what a given
-- action is allowed to stamp, exactly as the execution PATCH whitelist already decides that an
-- owner pressing "I did this" may only ever touch a claimed field, never a verified one.
alter table public.client_requirements enable row level security;

do $$ begin
  create policy client_requirements_admin
    on public.client_requirements for all
    using (is_admin()) with check (is_admin());
exception when duplicate_object then null; end $$;

comment on table public.client_requirements is
  'What each client has already given us, once, across every setup card. Never holds secrets.';
