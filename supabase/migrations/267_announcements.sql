-- 267: announcements (owner 2026-09-17, "let's build it")
--
-- One row per thing an owner announced from Create → Announce: the kind, their answers, how
-- the picture is made, where it goes, when, the words, and THE PLAN: every line the sheet
-- promised ("we start the graphic", "Instagram, Facebook, Google on Fri 25", "tell the team"),
-- each with the id of the real thing it became (a scheduled post, a content draft, a work
-- order) and its status. Coming up reads the plan lines that have not happened yet.

create table if not exists public.announcements (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients(id) on delete cascade,
  kind          text not null,                      -- dish | hours | deal | event | hiring | open | holiday | else
  status        text not null default 'planned',    -- planned | in_progress | done | cancelled
  answers       jsonb not null default '{}'::jsonb, -- the owner's facts, as typed
  picture       jsonb not null default '{}'::jsonb, -- { mode, mediaUrls, brief, priceOn, brandKit, readyBy }
  places        jsonb not null default '{}'::jsonb, -- { accountIds, google, story, also: [...] }
  timing        jsonb not null default '{}'::jsonb, -- { mode, postBy, at, storyOnDay, again, boost }
  words         jsonb not null default '{}'::jsonb, -- { social, google, cta, languages }
  plan          jsonb not null default '[]'::jsonb, -- [{ key, label, detail, date, cost, status, ref: { kind, id } }]
  total_cents   integer not null default 0,
  created_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists announcements_client_idx on public.announcements (client_id, created_at desc);

alter table public.announcements enable row level security;
-- served only through the admin client from app routes (checkClientAccess); no client-side policy on purpose
