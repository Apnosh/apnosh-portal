-- 242: invoices.payment_processing_at — "money is in flight" (the Anchovies scare).
--
-- An ACH/bank payment takes ~4 business days to settle. During that window
-- Stripe shows the money as incoming but the invoice as unpaid — and so did our
-- admin, which read as "client didn't pay" while they genuinely had. The stamp
-- is set by the payment_intent.processing webhook event and cleared when the
-- invoice resolves (paid / failed / voided); admin shows "Payment in transit".
alter table invoices add column if not exists payment_processing_at timestamptz;
