-- 258_desk_till_and_handover — the Request Desk goes through the till, a website order ends in a
-- domain the owner holds, and "your count is in" is said once.
--
-- Four holes this closes, all found by reading the desk and delivery code end to end:
--
--  1. A DESK ORDER NEVER TOUCHED STRIPE. POST /api/requests stored quote_cents + accepted_at and
--     minted the work order on the spot, with no charge. The screen said "Goes on your Apnosh
--     bill" and there was no bill. The desk now pays the way the cart pays — the same
--     PaymentIntent, the same fee, the same Stripe Tax, the same kill switch — so a payment row
--     needs somewhere to say WHICH order it paid for. campaign_payments.campaign_id was already
--     nullable and the table has never carried a CHECK, so request_id sits beside it with no
--     constraint surgery. Exactly one of the two is set in practice; that is not enforced here
--     because a legacy row can honestly have neither.
--
--  2. THE REQUEST ROW COULD NOT SAY IT WAS PAID. paid_at + payment_id are what the work-order
--     mint now waits for: nothing is made until the money is verified.
--
--  3. A WEBSITE HANDOVER WAS A PROMISE, NOT A CHECKLIST. A site or landing page delivery ends
--     with things that have to change hands — the domain, the DNS, the hosting login, analytics.
--     `handover` holds those items and who ticked each, on the work order that delivers them.
--
--  4. "YOUR COUNT IS IN" HAD NO DEDUPE. The cron that tells an owner their number is ready runs
--     daily; counted_notified_at is what stops it saying so every day forever.
--
-- Money is in integer CENTS everywhere. Safe to re-run: every statement is guarded.
-- Applied by hand in the Supabase SQL editor. Tenancy is unchanged — every table here is already
-- keyed on client_id.

-- ── 1. a payment can belong to a desk order ──────────────────────────────────
alter table public.campaign_payments
  add column if not exists request_id uuid references public.creative_requests(id) on delete set null;

create index if not exists idx_campaign_payments_request
  on public.campaign_payments (request_id) where request_id is not null;

comment on column public.campaign_payments.request_id is
  'The creative_requests row this charge paid for (desk orders). Null for campaign checkouts, where campaign_id is set instead.';

-- ── 2. the desk order knows it is paid ───────────────────────────────────────
alter table public.creative_requests add column if not exists paid_at timestamptz;
alter table public.creative_requests add column if not exists payment_id uuid;

create index if not exists idx_creative_requests_paid
  on public.creative_requests (paid_at) where paid_at is not null;

comment on column public.creative_requests.paid_at is
  'When the card cleared. The work order mints only after this is set; before it, the order is priced and waiting.';
comment on column public.creative_requests.payment_id is
  'campaign_payments.id for the charge that paid this order.';

-- ── 2b. an owner-placed order says it is waiting for the card ────────────────
-- A priced order the OWNER placed used to land in 'quoted', the same status a person's quote
-- lands in — and POST /api/requests/[id]/accept mints work from any 'quoted' row with no payment
-- check at all. So an owner could place a $600 order and then say yes to their own price and have
-- it made for nothing. 'awaiting_payment' is the till's own status: nobody but the till writes it,
-- and the accept path refuses it.
--
-- Pre-258 the CHECK rejects the value (23514) and the route falls back to 'requested' — never
-- 'quoted' — so the free-work path stays shut even before this SQL runs.
alter table public.creative_requests drop constraint if exists creative_requests_status_check;
alter table public.creative_requests add constraint creative_requests_status_check
  check (status in ('requested', 'in_review', 'quoted', 'awaiting_payment', 'in_progress', 'delivered', 'closed', 'declined'));

-- ── 3. the handover checklist, on the work order that delivers it ────────────
-- Shape: { "items": [ { "id": "domain", "done": true, "doneAt": "…", "note": "…" } ] }.
-- Read and written through src/lib/campaigns/handover.ts, which owns the item list; nothing here
-- constrains the shape, because the required items change as the playbooks do.
alter table public.service_work_orders add column if not exists handover jsonb;
alter table public.creator_work_orders add column if not exists handover jsonb;

comment on column public.service_work_orders.handover is
  'Website/landing-page handover checklist: domain, DNS, hosting login, analytics, who owns what. Every required item must be ticked before the order can be delivered.';

-- ── 4. the count notice is said once ─────────────────────────────────────────
alter table public.order_promises add column if not exists counted_notified_at timestamptz;

create index if not exists idx_order_promises_counted_notify
  on public.order_promises (shows_on) where counted_notified_at is null;

comment on column public.order_promises.counted_notified_at is
  'When we told the owner their count was in. The daily cron skips a row that has one, so the notice is sent once per promise, never every morning after.';

notify pgrst, 'reload schema';
