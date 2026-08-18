-- 241: design_price_sheets — the rate card as versioned DATA (GD-1).
--
-- Why: prices in code can only be changed by a developer and give orders nothing
-- to point back to. Each row here is a complete, immutable price sheet; the
-- highest ACTIVE version is what the server prices with, and every order records
-- the version it was bought under, so a later price change can never rewrite
-- what an existing client was promised. Multi-currency later = one sheet per
-- currency; today everything is usd.
--
-- card:  the RateCard shape (tierBase, destinationAdder, photoSourcing,
--        printManagement, rushMultiplier, rushWindowHours, includedRevisions).
--        Partial cards are allowed — missing keys fall back to the code card.
-- costs: optional per-key cost basis (what fulfillment costs us), used by the
--        margin-floor warning when a sheet is loaded. Advisory, never blocking.
--
-- Version 0 is implicit: the code RATE_CARD, used whenever no active row exists.

create table if not exists design_price_sheets (
  id uuid primary key default gen_random_uuid(),
  version integer not null unique check (version > 0),
  active boolean not null default false,
  currency text not null default 'usd',
  card jsonb not null,
  costs jsonb not null default '{}'::jsonb,
  note text,
  created_at timestamptz not null default now(),
  created_by uuid
);

-- Service-role only (admin tooling writes, the pricing loader reads).
-- RLS on with no policies = no anon/authenticated access.
alter table design_price_sheets enable row level security;
