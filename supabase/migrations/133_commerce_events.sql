-- Commerce events from the client's site: online orders + reservations.
-- Captured via webhook, same pattern as form_submissions. Whatever
-- platform the restaurant uses (Toast, Square, DoorDash, OpenTable,
-- Resy, Tock) can POST event payloads to a per-client webhook URL.
--
-- Tracks the funnel stages, not just completions:
--   started   — user opened the cart/widget
--   added     — item added / date selected
--   submitted — checkout / reservation submitted
--   confirmed — payment/reservation confirmed (the goal)
--   cancelled — user cancelled before completing
--
-- This makes "X% of cart-openers actually convert" computable.

create type commerce_event_kind as enum ('order', 'reservation');
create type commerce_event_stage as enum ('started', 'added', 'submitted', 'confirmed', 'cancelled');

create table if not exists commerce_events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  kind commerce_event_kind not null,
  stage commerce_event_stage not null,
  /* Platform-side ID so duplicate webhooks dedupe cleanly. */
  external_id text,
  /* Per-platform source label: 'toast', 'opentable', 'square', etc. */
  source text,
  /* Total amount in cents for order events, null for reservations. */
  amount_cents integer,
  /* Reservation-only: party size, requested date. */
  party_size integer,
  scheduled_at timestamptz,
  /* Free-form payload for the rest of the event body. */
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists commerce_events_client_idx
  on commerce_events(client_id, occurred_at desc);
create index if not exists commerce_events_funnel_idx
  on commerce_events(client_id, kind, stage, occurred_at desc);
/* Dedupe key — same external_id from same source can only insert once. */
create unique index if not exists commerce_events_dedupe_idx
  on commerce_events(client_id, source, kind, stage, external_id)
  where external_id is not null;

alter table commerce_events enable row level security;

do $$ begin
  create policy "client read commerce_events"
    on commerce_events for select
    using (
      client_id in (
        select b.client_id from businesses b where b.owner_id = auth.uid()
        union
        select cu.client_id from client_users cu where cu.auth_user_id = auth.uid()
      )
    );
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "admin all commerce_events"
    on commerce_events for all
    using (is_admin())
    with check (is_admin());
exception when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
