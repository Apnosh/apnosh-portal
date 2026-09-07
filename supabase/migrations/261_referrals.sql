-- 261_referrals — tell a friend: the code, the two-sided credit, and the ledger under both.
--
-- WHAT THIS IS FOR. An owner who has been kept a promise is the only person who can honestly
-- recommend us, so the loop is: they get a code, a friend starts with $50 off their first paid
-- order, and the owner gets $50 back ONLY AFTER that friend's order reaches a counted number.
-- Not on signup, not on payment — on the count. A referral paid out at payment would leave real
-- money out the door on an order that was refunded the next morning.
--
-- Three tables, all keyed on client_id:
--
--   referral_codes   one code per client, forever. The code is the link.
--   referrals        one row per REFERRED client, ever. It carries the state machine and the two
--                    amounts, so the ledger can always say who was paid what and why.
--   client_credits   money we owe a client, in cents, and how much of it has been spent. Both
--                    halves of the referral land here: the friend's $50 off, and the owner's $50.
--
-- MONEY RULES WRITTEN INTO THE SHAPE.
--   · Amounts are integer CENTS, like every other money column in this database.
--   · credited_at is the idempotency key for the payout. The cron claims a row by stamping it
--     (`where credited_at is null`), so two overlapping runs cannot pay the same referral twice.
--   · consumed_cents / consumed_at say a credit was SPENT. A spent credit is never clawed back —
--     see the comment on the column; a refund voids the referral, it does not reach into an order
--     that already used the money.
--   · voided_at + void_reason are how a credit dies (fraud, a full refund before the count).
--
-- Nothing here is switched on by its own existence: every reader is behind REFERRALS_ENABLED
-- (src/lib/referral-gate.ts) and, for the owner-facing entry, behind having one counted promise.
-- Safe to re-run. Applied by hand in the Supabase SQL editor.

-- ── 1. the code ──────────────────────────────────────────────────────────────
-- One per client. 6-8 characters from a charset with no 0/O/1/I/L in it, because this code is
-- read off a phone screen and typed by somebody else (src/lib/referrals/model.ts holds the
-- charset, and the sim proves the two agree).
create table if not exists public.referral_codes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique references public.clients(id) on delete cascade,
  code text not null unique check (char_length(code) between 6 and 8),
  created_at timestamptz not null default now()
);

comment on table public.referral_codes is
  'One referral code per client, forever. apnosh.com/r/<code> lands on onboarding with ?ref=<code>.';

-- ── 2. the referral ──────────────────────────────────────────────────────────
-- ONE ROW PER REFERRED CLIENT, EVER (referred_client_id is unique). A business can be referred
-- once in its life; that unique index is the whole of "one credit per referred client ever".
create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_client_id uuid not null references public.clients(id) on delete cascade,
  referred_client_id uuid not null unique references public.clients(id) on delete cascade,
  code text not null,
  -- signed_up        the friend finished setup with the code on
  -- first_order_paid their first order was collected
  -- credited         the referrer's credit has been issued (credited_at is stamped)
  -- void             it will never pay: a full refund before the count, or a fraud floor
  status text not null default 'signed_up'
    check (status in ('signed_up', 'first_order_paid', 'credited', 'void')),
  credit_cents_referrer integer not null default 0,
  credit_cents_referred integer not null default 0,
  -- The referred client's first collected order. Kept so the refund check and the count check
  -- both look at the SAME order rather than each picking their own.
  referred_payment_id uuid,
  first_order_paid_at timestamptz,
  credited_at timestamptz,
  voided_at timestamptz,
  void_reason text,
  -- Self-referral cannot even be stored, let alone paid.
  constraint referrals_not_self check (referrer_client_id <> referred_client_id),
  created_at timestamptz not null default now()
);

create index if not exists idx_referrals_referrer on public.referrals (referrer_client_id, created_at desc);
create index if not exists idx_referrals_status on public.referrals (status);
-- The cron's own read: the rows that could still become money.
create index if not exists idx_referrals_open on public.referrals (status) where credited_at is null and voided_at is null;

comment on table public.referrals is
  'One row per referred client, ever. The unique on referred_client_id IS the "one credit per referred business" rule.';
comment on column public.referrals.credited_at is
  'When the referrer was paid. The cron claims a row by stamping this where it is null, so a referral can never pay twice.';

-- ── 3. the credits ledger ────────────────────────────────────────────────────
create table if not exists public.client_credits (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  cents integer not null check (cents > 0),
  -- 'friend_signup' (the referred owner's $50 off) or 'friend_credited' (the referrer's $50).
  reason text not null,
  referral_id uuid references public.referrals(id) on delete set null,
  consumed_cents integer not null default 0,
  -- The part of consumed_cents that belongs to the CURRENT hold (the checkout below). It is what
  -- makes an abandoned checkout give the money back: the next checkout subtracts this, and only
  -- this, before working out what is left.
  held_cents integer not null default 0,
  consumed_at timestamptz,
  -- The checkout this credit was spent on. A credit is claimed when the PaymentIntent is created
  -- (the intent's amount already has the credit taken off it), and a claim whose intent never
  -- collected is re-claimable by the next checkout — see claimFriendCredit in
  -- src/lib/referrals/server.ts.
  consumed_intent_id text,
  voided_at timestamptz,
  void_reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_client_credits_client on public.client_credits (client_id, created_at desc);
create index if not exists idx_client_credits_open on public.client_credits (client_id) where consumed_at is null and voided_at is null;
-- One signup credit per referral, and one payout credit per referral. Belt and braces beside
-- referrals.credited_at: even a cron with a bug cannot write the same payout twice.
create unique index if not exists idx_client_credits_one_per_reason
  on public.client_credits (referral_id, reason) where referral_id is not null;

comment on table public.client_credits is
  'Money we owe a client, in cents. Both halves of a referral land here.';
comment on column public.client_credits.consumed_cents is
  'How much of this credit has been spent. A SPENT credit is never clawed back: if the order behind the referral is refunded later, the referral is voided for anything still to come, but money already taken off a bill the owner paid stays taken off. Reversing it would mean billing an owner for a discount we offered them.';

-- ── 4. the owner can be shown publicly, and only if they say so ──────────────
-- Default FALSE: nobody's business appears on a public page because a feature shipped.
alter table public.clients add column if not exists featured_opt_in boolean not null default false;
comment on column public.clients.featured_opt_in is
  'The owner ticked "Show my page" on /dashboard/tell-a-friend. /owners/<slug> is 404 + noindex until they do.';

-- ── 5. the receipt says the credit was there ─────────────────────────────────
-- Without these two the checkout row would say the card was charged $X and no line anywhere would
-- explain why $X was $50 short.
alter table public.campaign_payments add column if not exists friend_credit_cents integer not null default 0;
alter table public.campaign_payments add column if not exists client_credit_id uuid references public.client_credits(id) on delete set null;

comment on column public.campaign_payments.friend_credit_cents is
  'The friend credit taken off this bill BEFORE the service fee and the tax. 0 on every order that had none.';

-- ── 6. RLS: an owner sees their own rows and nothing else ────────────────────
-- Every write in the product goes through the service-role client, which bypasses RLS. These
-- policies exist so that a signed-in owner reading the tables directly (or a bug in a future
-- route) can only ever see their own account, and so the public /owners/<slug> page — which
-- reads with the service role — is the ONLY way anything here leaves an account.
alter table public.referral_codes enable row level security;
alter table public.referrals enable row level security;
alter table public.client_credits enable row level security;

do $$ begin
  create policy referral_codes_admin on public.referral_codes for all using (is_admin()) with check (is_admin());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy referral_codes_owner_read on public.referral_codes for select using (
    exists (select 1 from public.client_users cu where cu.client_id = referral_codes.client_id and cu.auth_user_id = auth.uid())
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy referrals_admin on public.referrals for all using (is_admin()) with check (is_admin());
exception when duplicate_object then null; end $$;
-- The REFERRER may read the friends they sent. The referred owner may not read the row about
-- them: it names another business.
do $$ begin
  create policy referrals_owner_read on public.referrals for select using (
    exists (select 1 from public.client_users cu where cu.client_id = referrals.referrer_client_id and cu.auth_user_id = auth.uid())
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy client_credits_admin on public.client_credits for all using (is_admin()) with check (is_admin());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy client_credits_owner_read on public.client_credits for select using (
    exists (select 1 from public.client_users cu where cu.client_id = client_credits.client_id and cu.auth_user_id = auth.uid())
  );
exception when duplicate_object then null; end $$;

notify pgrst, 'reload schema';
