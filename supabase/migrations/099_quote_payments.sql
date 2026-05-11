-- ─────────────────────────────────────────────────────────────
-- 099_quote_payments.sql
--
-- Adds payment tracking to content_quotes so an approved quote can
-- trigger a Stripe invoice automatically and we can mirror the
-- invoice lifecycle back onto the quote.
--
-- Lifecycle for a quoted line of work:
--   draft  ->  sent  ->  approved   (client clicks Approve)
--                            |
--                            v
--                  invoice created in Stripe (payment_status = pending)
--                            |
--           paid <----+-------+-------> failed
--                    |               (payment_status = failed)
--                    v
--           payment_status = paid
--           paid_at set
--           strategist can start work
--
-- payment_status of 'not_required' covers the case where a strategist
-- approves a quote but explicitly waives charge (test, comp, internal).
-- ─────────────────────────────────────────────────────────────

alter table content_quotes
  add column if not exists payment_status text not null default 'not_required'
    check (payment_status in ('not_required', 'pending', 'paid', 'failed', 'refunded', 'voided')),
  add column if not exists stripe_invoice_id text unique,
  add column if not exists stripe_invoice_hosted_url text,
  add column if not exists stripe_invoice_pdf_url text,
  add column if not exists amount_due_cents integer,
  add column if not exists paid_at timestamptz,
  add column if not exists payment_failed_at timestamptz,
  add column if not exists payment_failure_reason text;

create index if not exists content_quotes_payment_status_idx
  on content_quotes(client_id, payment_status, sent_at desc);

create index if not exists content_quotes_stripe_invoice_idx
  on content_quotes(stripe_invoice_id)
  where stripe_invoice_id is not null;

comment on column content_quotes.payment_status is
  'Tracks the Stripe invoice lifecycle. pending -> paid|failed. not_required when the strategist waives charge.';

comment on column content_quotes.stripe_invoice_id is
  'Stripe invoice id created at quote-approval time. Links the webhook back to this row.';
