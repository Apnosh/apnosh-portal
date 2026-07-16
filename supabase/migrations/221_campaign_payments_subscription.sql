-- 221_campaign_payments_subscription — record the auto-started monthly subscription (G4).
--
-- Charge-at-checkout only takes the ONE-TIME bill. A plan's recurring/monthly services were shown on
-- the bill but never actually started (silent lost revenue). Now, at /checkout/complete, we start a
-- real Stripe subscription (TEST MODE) for the monthly total from the SAVED CARD (charge_automatically)
-- — the client saw + agreed to it on the bill before paying. This records the subscription so a retry/
-- webhook can never create a second one, and a creation failure is visible (not silently dropped).
--
-- Owner runs this in Supabase. Code degrades if it isn't applied yet: the subscription starter reads
-- these columns defensively and no-ops on the missing-column error, so a checkout never breaks.

alter table campaign_payments
  add column if not exists stripe_subscription_id text,
  -- none    → no recurring lines on this order (nothing to start)
  -- active  → subscription created + billing
  -- failed  → creation failed; staff notified, safe to retry (the one-time order still stands)
  add column if not exists subscription_status text,
  -- the agreed monthly total (cents) shown on the bill; recorded for the receipt + retry.
  add column if not exists monthly_cents integer;

create index if not exists idx_campaign_payments_subscription on campaign_payments(stripe_subscription_id) where stripe_subscription_id is not null;

comment on column campaign_payments.stripe_subscription_id is 'The auto-started monthly subscription for this order''s recurring services (test mode). NULL until started.';
comment on column campaign_payments.subscription_status is 'none | active | failed — the monthly subscription state (G4). failed = staff notified, one-time order still stands.';

notify pgrst, 'reload schema';
