-- 266 — A small per-client cache for reads that are slow to make and cheap to keep.
--
-- The Reputation section waited on two slow things every time it opened: the vendor's
-- comment list (a round trip per post) and the model's read of those comments. Neither
-- changes minute to minute. This table holds the last answer under a key, so the page
-- paints from it at once and the refresh happens in the background.
--
-- One row per (client, key). The payload is whatever the writer stored; computed_at says
-- how old it is, and every reader decides its own freshness rule. Nothing here is a
-- source of truth: every key can be rebuilt from the vendor or the model at any time.

create table if not exists public.client_cache (
  client_id    uuid not null references public.clients(id) on delete cascade,
  key          text not null,
  payload      jsonb not null,
  computed_at  timestamptz not null default now(),
  primary key (client_id, key)
);

create index if not exists client_cache_computed_idx
  on public.client_cache (computed_at desc);

alter table public.client_cache enable row level security;
-- served only through the admin client from the server; no client-side policy on purpose
