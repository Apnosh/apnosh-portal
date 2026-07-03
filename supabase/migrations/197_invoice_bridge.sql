-- 197: the accrual→invoice bridge (NEXT-4).
--
-- campaign_charges learns which Stripe invoice collects it: the bridge action
-- stamps stripe_invoice_id when an admin generates an invoice from accrued
-- charges, and the webhook flips invoiced→paid (invoice.paid) or releases the
-- claim back to accrued (invoice.voided) by that id. invoiced_at doubles as the
-- stranded-claim clock for the reconcile backstop (a claim with no invoice id
-- after an hour means the Stripe call died mid-flight and gets reverted).
--
-- creator_payouts learns its Stripe Connect transfer id + timestamp so money-out
-- is auditable when the Connect rail turns on.
--
-- All additive and inert until the code that writes them deploys.

alter table campaign_charges add column if not exists stripe_invoice_id text;
alter table campaign_charges add column if not exists invoiced_at timestamptz;
alter table campaign_charges add column if not exists paid_at timestamptz;

create index if not exists idx_campaign_charges_stripe_invoice
  on campaign_charges (stripe_invoice_id) where stripe_invoice_id is not null;
create index if not exists idx_campaign_charges_client_status
  on campaign_charges (client_id, status);

alter table creator_payouts add column if not exists stripe_transfer_id text;
alter table creator_payouts add column if not exists paid_at timestamptz;
