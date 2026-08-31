-- 249: proof cards — fired outcome cards ("This week on Google", a post's
-- reach, a rising review month). One row per fired card per client; the
-- nightly composer writes them, Home shows the newest live one, Results
-- archives the rest. card_key is the natural idempotency key.
create table if not exists proof_cards (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  card_key text not null,
  card_type text not null check (card_type in ('gbp_week', 'post', 'reviews')),
  label text not null,
  big text not null,
  context text not null,
  attribution text,
  spark jsonb,
  is_sample boolean not null default false,
  fired_at timestamptz not null default now(),
  read_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (client_id, card_key)
);
create index if not exists idx_proof_cards_client_fired on proof_cards (client_id, fired_at desc);
