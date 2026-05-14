-- Per-client citation audit log. Strategists run a NAP consistency
-- check across Yelp, TripAdvisor, Apple Maps, Facebook, Foursquare,
-- BBB, and store findings here. Each row is one (client × platform)
-- snapshot at the time of the audit.

create table if not exists citation_audits (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  platform text not null,                          -- 'yelp' | 'tripadvisor' | 'apple_maps' | 'facebook' | 'foursquare' | 'bbb'
  listing_url text,                                -- canonical platform URL
  name_found text,
  address_found text,
  phone_found text,
  consistent boolean,                              -- vs GBP NAP
  inconsistencies text[],                          -- ['phone', 'address']
  checked_at timestamptz not null default now(),
  checked_by uuid references auth.users(id) on delete set null,
  source text not null default 'manual',           -- 'manual' | 'api' | 'scrape'
  notes text
);

create index if not exists citation_audits_client_idx
  on citation_audits(client_id, checked_at desc);

create unique index if not exists citation_audits_one_per_platform
  on citation_audits(client_id, platform);

alter table citation_audits enable row level security;

do $$ begin
  create policy "client read citation_audits"
    on citation_audits for select
    using (
      client_id in (
        select client_id from profiles
        where id = auth.uid() and client_id is not null
      )
    );
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "admin all citation_audits"
    on citation_audits for all
    using (is_admin())
    with check (is_admin());
exception when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
