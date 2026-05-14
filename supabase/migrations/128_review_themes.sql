-- Cached AI-extracted themes from a client's reviews. Regenerated
-- weekly (or on demand) so the reviews page can show themes
-- without running an LLM on every page load.
create table if not exists review_themes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  location_id uuid references client_locations(id) on delete cascade,
  generated_at timestamptz not null default now(),
  window_start date not null,
  window_end date not null,
  /* [{ theme, mentions, praise, critical, examples: [{ rating, snippet }] }, ...] */
  themes jsonb not null,
  review_count integer not null default 0
);

create index if not exists review_themes_client_idx
  on review_themes(client_id, generated_at desc);

alter table review_themes enable row level security;

do $$ begin
  create policy "client read review_themes"
    on review_themes for select
    using (
      client_id in (
        select client_id from profiles
        where id = auth.uid() and client_id is not null
      )
    );
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "admin all review_themes"
    on review_themes for all
    using (is_admin())
    with check (is_admin());
exception when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
