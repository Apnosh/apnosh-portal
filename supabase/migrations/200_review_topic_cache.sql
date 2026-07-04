-- Cache for the insights Reviews view's AI topic breakdown, so the page doesn't
-- run a Claude call on every load. One row per client. Recomputed only when the
-- review signature (count + newest review date) changes — i.e. when new reviews
-- actually arrive. Served through the admin client (service role), so RLS just
-- locks out any direct client/anon access.
create table if not exists review_topic_cache (
  client_id uuid primary key references clients(id) on delete cascade,
  /* { summary: string | null, topics: [{ name, positive, negative, mentions, direction, quote }] } */
  payload jsonb not null,
  /* "<total review count>:<newest review timestamp>" — recompute when this changes */
  review_sig text not null,
  computed_at timestamptz not null default now()
);

alter table review_topic_cache enable row level security;

do $$ begin
  create policy "admin all review_topic_cache"
    on review_topic_cache for all
    using (is_admin())
    with check (is_admin());
exception when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
