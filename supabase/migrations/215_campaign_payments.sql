-- 215_campaign_payments — the checkout charge record for the campaign cart.
--
-- Charge-at-checkout: when an owner places an order from the cart, we charge their card
-- for the full one-time bill (items + 10% service fee + Stripe-computed tax) via a Stripe
-- PaymentIntent, THEN ship the campaign. This table is the durable record tying that
-- PaymentIntent to the campaign + the exact amounts we billed, so a receipt can always be
-- reconstructed and a paid-but-not-yet-shipped edge (tab closed after paying) is recoverable
-- from the stored draft snapshot.
--
-- All money is in integer CENTS (matches billing_customers / invoices / campaign_charges).
-- Monthly (recurring) services are NOT charged here — they're shown on the bill and set up
-- separately; this row only ever represents the one-time charge taken at checkout.
create table if not exists campaign_payments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  -- Set once the campaign is created + shipped (after a successful charge). NULL while pending,
  -- or on the rare paid-but-unshipped edge (recover by shipping from `draft`).
  campaign_id uuid references campaigns(id) on delete set null,
  stripe_payment_intent_id text unique not null,
  stripe_customer_id text not null,
  -- The itemized bill, exactly as charged.
  subtotal_cents integer not null default 0,   -- one-time items subtotal
  service_fee_cents integer not null default 0, -- 10% of subtotal
  tax_cents integer not null default 0,         -- Stripe Tax; 0 if Tax not enabled / no address
  total_cents integer not null default 0,       -- subtotal + fee + tax (what the card is charged)
  currency text not null default 'usd',
  -- pending  → PaymentIntent created, awaiting confirmation
  -- paid     → charge succeeded (card captured)
  -- failed   → charge failed / abandoned
  -- refunded → later reversed
  status text not null default 'pending',
  -- Stripe Tax bookkeeping: the calculation drives the tax_cents; on success we record a
  -- committed tax transaction against the campaign for the client's tax reporting.
  stripe_tax_calculation_id text,
  stripe_tax_transaction_id text,
  -- The composed CampaignDraft snapshot, so a paid-but-unshipped order can be shipped without
  -- the client round-trip (webhook/admin recovery). JSON, not a foreign key.
  draft jsonb,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  shipped_at timestamptz
);

create index if not exists idx_campaign_payments_client on campaign_payments(client_id, created_at desc);
create index if not exists idx_campaign_payments_campaign on campaign_payments(campaign_id);
create index if not exists idx_campaign_payments_status on campaign_payments(status);

-- RLS on, admin-only policy (matches campaign_charges / creator_payouts). All checkout reads/writes
-- go through the service-role client, which bypasses RLS, so this only locks the table away from the
-- public/authenticated API — payment rows are never directly readable by a client.
alter table campaign_payments enable row level security;
create policy campaign_payments_admin on campaign_payments for all using (is_admin()) with check (is_admin());

comment on table campaign_payments is 'Charge-at-checkout record for the campaign cart: one Stripe PaymentIntent per placed order, with the exact billed amounts (cents) and a draft snapshot for recovery. One-time charge only; monthly services billed separately.';
