-- 265 — Zernio webhook receipts.
--
-- Zernio delivers at-least-once. Its own schema says so plainly: X-Zernio-Event-Id
-- is "a UUID minted once per event and identical across every subscribed endpoint,
-- every automatic retry and every redelivery, so dedupe on it."
--
-- So this table is the dedupe key and nothing more. A row here means "we have
-- already acted on this event"; the insert IS the lock, which is why the id is the
-- primary key rather than a generated one. A duplicate delivery collides, we
-- return 200, and no handler runs twice.
--
-- The payload is kept for a fortnight because the first thing anyone asks about a
-- webhook is "what did it actually say", and Zernio's own delivery log is a
-- support ticket away rather than a query away.

create table if not exists public.zernio_webhook_events (
  -- X-Zernio-Event-Id, verbatim. Not generated: the vendor's id is the identity.
  id            text primary key,
  event         text not null,
  received_at   timestamptz not null default now(),
  -- what we did with it, so a delivery that arrived but changed nothing is
  -- distinguishable from one that never arrived at all
  handled       boolean not null default false,
  handler_note  text,
  payload       jsonb
);

create index if not exists zernio_webhook_events_received_idx
  on public.zernio_webhook_events (received_at desc);
create index if not exists zernio_webhook_events_event_idx
  on public.zernio_webhook_events (event, received_at desc);

-- Service-role only. Nothing owner-facing reads this table; it is plumbing.
alter table public.zernio_webhook_events enable row level security;

comment on table public.zernio_webhook_events is
  'Dedupe log for Zernio webhook deliveries. Primary key is the vendor''s X-Zernio-Event-Id, which is stable across retries and redeliveries.';

-- ─────────────────────────────────────────────────────────────────────────────
-- AND THE REASON THE COMPOSER HAS NO ROWS.
--
-- content_drafts.proposed_via has carried a CHECK since migration 107 allowing
-- only ('strategist','copywriter','designer','ai','client_request'). The
-- composer's handoff lane — "Send it to your team instead" — inserts
-- 'owner_composer'. It has therefore NEVER succeeded: every attempt violated the
-- constraint, threw, and returned "Could not send it over" to the owner.
--
-- That also corrects the reading of the usage numbers. Zero rows with
-- proposed_via='owner_composer' looked like "nobody used the feature". It is at
-- least partly "the feature could not write", and those are very different
-- facts to plan a roadmap on.
--
-- 'owner_composer' is added for the handoff and the publish record alike; both
-- are the owner acting for themselves, which is a proposer the 2024 vocabulary
-- did not have.

alter table public.content_drafts
  drop constraint if exists content_drafts_proposed_via_check;

alter table public.content_drafts
  add constraint content_drafts_proposed_via_check
  check (proposed_via in
    ('strategist','copywriter','designer','ai','client_request','owner_composer'));
