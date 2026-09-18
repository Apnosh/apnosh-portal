-- 268: the influencer marketplace (owner 2026-09-17, "design the marketplace properly").
-- Two tables. Both server-only (RLS on, no policies): every read and write goes through the
-- admin client behind checkClientAccess or the creator's own session.
--
-- creator_audience: who watches a creator. One row per vendor. Filled by the creator (cuisines,
-- rules) and, once they connect an account, by the sync (followers, views, engagement, where the
-- audience lives). verified_at is set ONLY by a connection, never by hand.
--
-- creator_posts: their recent posts and every collab post booked here, with the numbers. A row
-- with booking_id is a collab; the results engine reads it back into the plan.

create table if not exists public.creator_audience (
  vendor_id uuid primary key references public.vendors(id) on delete cascade,
  city text,
  platforms jsonb not null default '[]'::jsonb,          -- [{platform, handle, followers, avg_views, engagement, url, verified_at}]
  followers integer,                                     -- main channel
  avg_views integer,                                     -- a post, last 30 days, main channel
  engagement numeric(5,2),                               -- percent
  local_pct integer,                                     -- share of the audience in the metro
  ages text,                                             -- "25 to 34"
  cuisines text[] not null default '{}',
  styles text[] not null default '{}',
  languages text[] not null default '{}',
  response_hours integer,
  posts_within_days integer not null default 5,
  party_size integer not null default 2,
  meal_cap_cents integer not null default 6000,
  repost_ok boolean not null default true,
  whitelist_cents integer,                               -- null = not offered
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.creator_audience enable row level security;
revoke all on public.creator_audience from anon, authenticated;

create table if not exists public.creator_posts (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  booking_id uuid references public.bookings(id) on delete set null,
  kind text not null default 'sample' check (kind in ('sample', 'collab')),
  platform text not null default 'instagram',
  url text,
  thumb_url text,
  caption text,
  views integer,
  likes integer,
  saves integer,
  comments integer,
  link_taps integer,
  posted_at date,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists creator_posts_vendor_idx on public.creator_posts (vendor_id, posted_at desc);
create index if not exists creator_posts_booking_idx on public.creator_posts (booking_id) where booking_id is not null;
alter table public.creator_posts enable row level security;
revoke all on public.creator_posts from anon, authenticated;
