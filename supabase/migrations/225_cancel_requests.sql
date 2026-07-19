-- Owner cancellation REQUESTS (Amazon-style: not a guaranteed stop).
--
-- The owner used to have an instant "Stop this campaign" that terminally ended it.
-- That is now an admin action. From the order page the owner instead SUBMITS a
-- cancellation request; a human reviews it and either approves (runs the real
-- terminal stop) or declines (the campaign keeps running). Requesting does NOT by
-- itself stop work or billing — the copy says "not guaranteed", so it must be true.
--
-- Three nullable columns on campaigns (NULL everywhere = no request, exactly the
-- pre-migration behavior):
--   cancel_requested_at  when the owner asked
--   cancel_reason        the owner's optional note
--   cancel_state         'requested' (awaiting review) | 'declined' (kept running).
--                        An APPROVED request needs no state of its own: approval
--                        sets campaigns.status = 'stopped', the existing terminal state.
--
-- Safe to run more than once.

alter table campaigns
  add column if not exists cancel_requested_at timestamptz,
  add column if not exists cancel_reason text,
  add column if not exists cancel_state text;

do $$ begin
  alter table campaigns
    add constraint campaigns_cancel_state_chk
    check (cancel_state is null or cancel_state in ('requested', 'declined'));
exception when duplicate_object then null;
end $$;

-- Fast lookup of the open queue for the admin cockpit.
create index if not exists campaigns_cancel_requested_idx
  on campaigns (cancel_requested_at)
  where cancel_state = 'requested';

notify pgrst, 'reload schema';
