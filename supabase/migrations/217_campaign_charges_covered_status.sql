-- 217_campaign_charges_covered_status — add a 'covered_by_checkout' status to campaign_charges.
--
-- Context (G1, the double-billing fix). The app grew two billing models that now coexist:
--   • DELIVERY-GATED (the original): a piece accrues an owner charge when it publishes / is
--     approved; a later owner-triggered step invoices the accrued rows. (campaign_charges)
--   • CHARGE-AT-CHECKOUT (migration 215): the whole cart is charged upfront via one Stripe
--     PaymentIntent before the campaign ships. (campaign_payments)
--
-- Without this, a campaign paid IN FULL at checkout would ALSO accrue a per-piece charge as its
-- pieces publish, and createInvoiceFromAccruedCharges would bill the client a SECOND time. The fix
-- keeps the ledger honest (we still record that the piece was produced + what it was worth) but
-- marks the charge 'covered_by_checkout' so the invoicing path (which only ever claims 'accrued'
-- rows) can never bill it. The money-view aggregates (getCampaignCharges) already sum only
-- accrued/invoiced/paid, so a covered row never inflates "billed so far" either — the
-- campaign_payments row is that campaign's single source of "Paid $X".
--
-- Safe to run once; guarded so a re-run is a no-op. The accrual code degrades if this is NOT yet
-- applied: it detects the check violation and SKIPS the insert rather than falling back to
-- 'accrued' (which would re-introduce the double-bill), so no money is ever at risk pre-migration.

alter table public.campaign_charges drop constraint if exists campaign_charges_status_check;
alter table public.campaign_charges add constraint campaign_charges_status_check
  check (status in ('accrued','invoiced','paid','void','covered_by_checkout'));

notify pgrst, 'reload schema';
