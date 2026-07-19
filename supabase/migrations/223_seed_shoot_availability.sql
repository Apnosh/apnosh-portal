-- Seed one sensible STARTER shoot-availability rule (Phase 4: publish real availability).
--
-- Until a rule exists, the pre-checkout shoot gate runs in honest "request-mode" (it asks and the team
-- proposes times). This publishes a real, active team calendar so a shoot-bearing cart can hold a firm
-- open slot at checkout. The owner edits or turns this off from the admin Availability tab; the rule
-- only governs FUTURE picks, so editing it never disturbs a confirmed booking.
--
-- Starter windows (deliberately conservative — the owner tunes them): on-site shoots Tue/Wed/Thu
-- mornings, 9:00–13:00 Pacific, in two 2-hour slots (9:00 and 11:00), one shoot per slot, booked at
-- least 3 business days out, up to 45 days ahead. Weekday keys are 0=Sun..6=Sat (2=Tue, 3=Wed, 4=Thu),
-- matching the pure slot engine (computeOpenSlots).
--
-- OWNER-RUN, idempotent: inserts only when there is no active team shoot rule yet, so re-running is a
-- no-op and it never overwrites an availability the owner has already set up or edited.

insert into availability_rules
  (gate_kind, scope_kind, label, timezone, weekly, slot_minutes, capacity, lead_time_days, horizon_days, active)
select
  'shoot', 'team', 'On-site shoots', 'America/Los_Angeles',
  '{"2":[{"start":"09:00","end":"13:00"}],"3":[{"start":"09:00","end":"13:00"}],"4":[{"start":"09:00","end":"13:00"}]}'::jsonb,
  120, 1, 3, 45, true
where not exists (
  select 1 from availability_rules where gate_kind = 'shoot' and scope_kind = 'team' and active
);

notify pgrst, 'reload schema';
