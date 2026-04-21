-- ============================================================
-- Migration 063: separate billing email per client
-- ============================================================
-- Until now, Stripe invoices went to clients.email — the same address
-- used for general communication. In practice, businesses route
-- invoices to a dedicated address (info@, accounting@, billing@).
-- Add a nullable billing_email column; if set, it overrides
-- clients.email when creating Stripe customers / sending invoices.
-- ============================================================

alter table clients
  add column if not exists billing_email text;

comment on column clients.billing_email is
  'Override for invoice delivery. When set, Stripe invoices go here instead of clients.email. Null means fall back to clients.email.';
