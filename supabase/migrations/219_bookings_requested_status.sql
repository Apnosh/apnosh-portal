-- 219_bookings_requested_status — add a 'requested' status to bookings (Checkout Gates, Phase 3).
--
-- Formalizes REQUEST-MODE: when a shoot campaign checks out but no availability is published, we no
-- longer just show a note — we record a real 'requested' booking (bound to the PaymentIntent, no slot
-- yet) so the order is tracked, staff are told to schedule, and the SAME admin "assign a slot" action
-- that resolves a needs_reschedule can turn the request into a confirmed booking. Honest by
-- construction: a 'requested' row carries NO date, so the UI can only say "we'll reach out", never a
-- fake time.
--
-- Owner runs this in Supabase (service role can't DDL). Code degrades if it isn't applied yet: the
-- request path falls back to the Phase-2 honest note (no row written), so nothing breaks.

alter table public.bookings drop constraint if exists bookings_status_check;
alter table public.bookings add constraint bookings_status_check
  check (status in ('requested','held','confirmed','needs_reschedule','cancelled','completed'));

notify pgrst, 'reload schema';
