-- Link a "Get Featured" lead to the CRM client it was converted into.
--
-- When an admin clicks "Convert to CRM" on a feature_intake lead, we create a
-- clients row (with status='pending' so it lives in the CRM as a *lead*, not an
-- active client) and stamp its id here. This makes conversion idempotent — a
-- lead that already points at a client can't be double-converted — and lets the
-- leads page link straight to the created client profile.
--
-- On delete set null: if the client record is ever removed, the lead simply
-- reverts to "not converted" rather than breaking the reference.

alter table feature_intake
  add column if not exists converted_client_id uuid references clients(id) on delete set null;

comment on column feature_intake.converted_client_id is
  'The clients.id this lead was converted into (status=pending lead). Null until an admin converts it.';

notify pgrst, 'reload schema';
