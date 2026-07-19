-- 218_checkout_gates_supply — the coordination-primitive supply side (Phase 1 of "Checkout Gates").
--
-- Some campaigns need something AGREED before payment makes sense — a photoshoot needs a real date.
-- Today that forces a back-and-forth email thread after checkout. This migration lets the Apnosh team
-- PUBLISH real availability, so a client can only pick from slots that actually exist and the booking
-- is firm at checkout (Phase 2 wires the checkout picker + hold; Phase 3 handles changes).
--
-- Scope decision (owner-locked): ONE team calendar to start (scope_kind='team'); the vendor-scoped
-- column ships now but per-vendor calendars are NOT built yet.
--
-- Owner runs this in Supabase (service role can't DDL). Code degrades if it isn't applied yet:
-- getActiveGateRule / getOpenSlots return "no availability" (honest request-mode), and the gates
-- columns default to the smart derivation, so nothing breaks pre-migration.

-- ── availability_rules: the seller's published supply for a pre-checkout gate ──────────────────
-- Slot truth is COMPUTED, never stored: a candidate slot is open iff a weekly window allows it, the
-- lead time + horizon pass, and (confirmed + still-held) bookings for that slot are below capacity.
-- So editing a rule only ever governs FUTURE picks; it can never retro-touch a confirmed booking.
create table if not exists availability_rules (
  id uuid primary key default gen_random_uuid(),
  gate_kind text not null default 'shoot',                         -- 'shoot' first; future gate kinds reuse this table
  scope_kind text not null default 'team' check (scope_kind in ('team','vendor')),
  scope_id uuid,                                                    -- vendor id when scope_kind='vendor' (not built yet)
  label text,                                                      -- optional admin label ("On-site shoots")
  timezone text not null default 'America/Los_Angeles',            -- the wall-clock tz all window/slot times are in
  /* weekly windows keyed by weekday 0=Sun..6=Sat:
     { "1": [{"start":"09:00","end":"12:00"}], "3": [{"start":"09:00","end":"17:00"}] } */
  weekly jsonb not null default '{}'::jsonb,
  /* per-date overrides keyed by 'YYYY-MM-DD': [] = closed that day; [{start,end}] = altered windows */
  exceptions jsonb not null default '{}'::jsonb,
  slot_minutes int not null default 120,                           -- length of one bookable slot
  capacity int not null default 1,                                 -- how many bookings one slot start can hold
  lead_time_days int not null default 3,                           -- BUSINESS days of runway before the earliest bookable slot
  horizon_days int not null default 45,                            -- how far out (calendar days) slots are offered
  active boolean not null default false,                           -- only active rules ever reach a client
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists availability_rules_active on availability_rules (gate_kind, scope_kind, active);

alter table availability_rules enable row level security;
-- Admin (and the server's service role) manage everything. Client-side availability reads go through
-- the server (service role), so no client policy — the raw supply table stays locked away.
do $$ begin
  create policy availability_rules_admin on availability_rules for all using (is_admin()) with check (is_admin());
exception when duplicate_object then null; end $$;

-- ── bookings: one agreement instance (scheduling first; the machinery generalizes to other gates) ──
-- Wall-clock is the source of truth (slot_date + slot_start/slot_end 'HH:MM' in `timezone`) — no
-- timestamptz/DST trap, and the client always sees an unambiguous "Fri Aug 7, 9:00 AM PT".
-- status: held (30-min TTL bound to a PaymentIntent) → confirmed (charge cleared) → needs_reschedule
-- (admin/availability change) → cancelled / completed. Expired holds are IGNORED at read time (no
-- release cron): a hold only counts against capacity while status='held' AND hold_expires_at > now().
create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  gate_kind text not null default 'shoot',
  rule_id uuid references availability_rules(id) on delete set null,
  slot_date date,                                                  -- null for non-scheduling gates (agreement/input)
  slot_start text,                                                 -- 'HH:MM' wall clock in `timezone`
  slot_end text,
  timezone text,                                                   -- copied from the rule at hold time (honest display)
  status text not null default 'held'
    check (status in ('held','confirmed','needs_reschedule','cancelled','completed')),
  hold_expires_at timestamptz,                                     -- 30-min TTL while 'held'; ignored once confirmed
  stripe_payment_intent_id text,                                   -- the PI this hold rides (bound at prepare/hold)
  campaign_id uuid references campaigns(id) on delete set null,    -- bound at checkout/complete
  service_work_order_id uuid references service_work_orders(id) on delete set null,  -- the shoot's work order
  note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bookings_rule_day on bookings (rule_id, slot_date);
create index if not exists bookings_client on bookings (client_id, created_at desc);
create index if not exists bookings_pi on bookings (stripe_payment_intent_id) where stripe_payment_intent_id is not null;
create index if not exists bookings_campaign on bookings (campaign_id) where campaign_id is not null;

alter table bookings enable row level security;
do $$ begin
  create policy bookings_admin on bookings for all using (is_admin()) with check (is_admin());
exception when duplicate_object then null; end $$;

-- ── gate definitions per catalog item (same storage pattern as the needs config, migration 216) ──
-- Shape: [{ "id","kind":"booking"|"input"|"agreement","gateKind","when":"pre-checkout"|"flexible",
--           "required":bool,"params":{...} }]. NULL = use the smart default derivation (a draft with a
-- needsShoot service or a shoot-bearing content beat implies a pre-checkout shoot booking gate).
alter table catalog_content_overrides add column if not exists gates jsonb;
alter table catalog_campaigns add column if not exists gates jsonb;

comment on table availability_rules is 'Published seller availability for a pre-checkout gate (scheduling first). Slot openness is computed at read time from weekly windows + lead/horizon + live bookings vs capacity; editing a rule governs only future picks.';
comment on table bookings is 'One coordination-gate agreement instance (a shoot booking first). Wall-clock slot (slot_date + HH:MM in timezone). held→confirmed→needs_reschedule→cancelled/completed; a held row counts against capacity only while hold_expires_at > now().';
comment on column catalog_content_overrides.gates is 'Per-campaign gate config: [{id,kind,gateKind,when,required,params}]. NULL = smart default (needsShoot ⇒ pre-checkout shoot booking).';
comment on column catalog_campaigns.gates is 'Per-campaign gate config: [{id,kind,gateKind,when,required,params}]. NULL = smart default (needsShoot ⇒ pre-checkout shoot booking).';

notify pgrst, 'reload schema';
