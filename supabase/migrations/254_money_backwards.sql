-- 254_money_backwards — money that can go BACKWARDS (refunds, disputes, service charges).
--
-- Three holes this closes, all found by reading the money code end to end:
--
--  1. SERVICE WORK WROTE NO MONEY ROW. Creator pieces and team-published drafts accrue a
--     campaign_charges row when they land; service work (gbp-setup, listings, order button,
--     tracking, ...) accrued nothing. So a stopped prepaid campaign could not see what had
--     actually been delivered, and told the owner "Nothing is owed" while holding their money.
--     Fix: allow source 'service' and anchor the row on the purchased line (line_item_id),
--     one charge per (campaign, line) so a re-deliver is a no-op.
--
--  2. NO REFUND COULD BE RECORDED. A refund taken in the Stripe dashboard wrote nothing back:
--     the campaign_payments row stayed 'paid' forever, so isCampaignCheckoutPaid kept saying
--     "covered", every later piece was stamped covered_by_checkout, and nothing could be
--     invoiced. Fix: refunded_cents / refunded_at / stripe_refund_id on the payment row, plus
--     the tax reversal id so a reversed Stripe Tax transaction is never reversed twice.
--
--  3. A DISPUTE (chargeback) HAD NOWHERE TO LAND. Fix: disputed_at + dispute_cents, set by the
--     charge.dispute.created webhook, so admins are paged with a real number and the row says
--     the money is contested.
--
-- Money is in integer CENTS everywhere (matches campaign_payments / campaign_charges).
-- Safe to re-run: every statement is guarded.
--
-- NOTE on charge status: 'void' already exists in the status CHECK and already means exactly
-- "this row must never be billed" (getCampaignCharges and createInvoiceFromAccruedCharges both
-- skip it). The refund path reuses 'void' rather than adding a second spelling ('voided'), so
-- there is one word for one meaning.

-- ── 1. campaign_charges learns about service work ────────────────────────────
alter table public.campaign_charges add column if not exists line_item_id uuid;

alter table public.campaign_charges drop constraint if exists campaign_charges_source_check;
alter table public.campaign_charges add constraint campaign_charges_source_check
  check (source in ('creator','team','service'));

-- One charge per purchased service line (the accrual is idempotent on the line).
create unique index if not exists campaign_charges_service_line
  on public.campaign_charges (campaign_id, line_item_id) where line_item_id is not null;

-- ── 2. campaign_payments can record money going backwards ────────────────────
-- status is a free-text column (no CHECK in 215), so 'refunded' / 'partially_refunded' /
-- 'disputed' need no constraint change — only these columns.
alter table public.campaign_payments add column if not exists refunded_cents integer not null default 0;
alter table public.campaign_payments add column if not exists refunded_at timestamptz;
alter table public.campaign_payments add column if not exists stripe_refund_id text;
alter table public.campaign_payments add column if not exists stripe_tax_reversal_id text;

-- ── 3. a chargeback has a place to land ──────────────────────────────────────
alter table public.campaign_payments add column if not exists disputed_at timestamptz;
alter table public.campaign_payments add column if not exists dispute_cents integer not null default 0;

create index if not exists idx_campaign_payments_refunded
  on public.campaign_payments (refunded_at) where refunded_at is not null;
create index if not exists idx_campaign_payments_disputed
  on public.campaign_payments (disputed_at) where disputed_at is not null;

comment on column public.campaign_payments.refunded_cents is 'Total refunded so far, in cents. 0 = nothing refunded. Equal to total_cents = fully refunded.';
comment on column public.campaign_payments.disputed_at is 'Set when Stripe reports a chargeback on this charge. Work on the campaign is paused by hand until it resolves.';

notify pgrst, 'reload schema';
