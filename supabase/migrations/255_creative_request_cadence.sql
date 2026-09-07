-- 255_creative_request_cadence — say on the row whether an order repeats.
--
-- The Request Desk prices social work by the month ("$320 a month") but POST /api/requests stores
-- quote_cents ONCE, with nothing saying it repeats, and mints one work order. Nothing bills a
-- second month. The screen now says "for the first month", which is true — and this column is what
-- lets the desk go through the till later without guessing which past orders were meant to repeat.
--
-- Written by the route now, read by nothing yet. Best-effort on the write (a 42703 falls back), so
-- the desk keeps working before this SQL is run.
--
-- Safe to re-run: every statement is guarded.

alter table public.creative_requests add column if not exists cadence text;

alter table public.creative_requests drop constraint if exists creative_requests_cadence_check;
alter table public.creative_requests add constraint creative_requests_cadence_check
  check (cadence is null or cadence in ('once', 'monthly'));

comment on column public.creative_requests.cadence is
  'once = a single order (the default). monthly = priced per month; today it is still billed once, and no subscription exists.';

create index if not exists idx_creative_requests_cadence
  on public.creative_requests (cadence) where cadence is not null;

notify pgrst, 'reload schema';
