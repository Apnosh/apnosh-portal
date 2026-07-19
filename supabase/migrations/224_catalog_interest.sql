-- Catalog interest ("Tell me when it's ready") — owner-sim Phase 5.
--
-- A coming-soon product page used to be a total dead end: no notify, no detour, and the
-- highest-budget owners walked (the sim's break #5, ~$6,300/mo of intent). This table records
-- which owner wants which coming-soon card, so:
--   1. the team SEES real demand per card (the honest prioritization signal), and
--   2. when a card flips live, the owners who asked can be told.
--
-- Written only by the server (service role) via POST /api/catalog/interest, which also pages
-- the client's strategist so interest is visible immediately even before any admin surface
-- reads this table. One row per (client, card); asking twice is a no-op.
--
-- Safe to run more than once (idempotent guards throughout). RLS on with no anon policies:
-- service-role only, same posture as other server-written tables.

create table if not exists catalog_interest (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  item_id text not null,
  -- What the card was called when they asked (catalog titles can be renamed later).
  item_title text,
  created_at timestamptz not null default now(),
  unique (client_id, item_id)
);

create index if not exists catalog_interest_item_idx on catalog_interest (item_id);

alter table catalog_interest enable row level security;

notify pgrst, 'reload schema';
