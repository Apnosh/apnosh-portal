-- ============================================================================
-- Migration 196 — Attribution rail + campaign-stop groundwork
--
-- (a) tracked_links (024) finally becomes the campaign attribution rail: it had
--     a reader/incrementer (/r/[code]) but NO writer and no campaign linkage.
--     Add campaign_id/draft_id so links minted at publish time join back to the
--     piece and campaign, plus an ATOMIC click increment (the route's old
--     read-then-write lost concurrent clicks).
-- (b) service_work_orders gains a 'cancelled' terminal so stopping a campaign
--     can void not-yet-delivered service work instead of leaving live-looking
--     rows in staff queues (the 190 CHECK had no dead state).
--
-- All additive / widening — safe against running code.
-- ============================================================================

alter table public.tracked_links
  add column if not exists campaign_id uuid references public.campaigns(id) on delete set null;
alter table public.tracked_links
  add column if not exists draft_id uuid references public.content_drafts(id) on delete set null;

create index if not exists idx_tracked_links_campaign
  on public.tracked_links (campaign_id) where campaign_id is not null;
-- One tracked link per draft: makes minting at the publish chokepoint idempotent.
create unique index if not exists idx_tracked_links_draft
  on public.tracked_links (draft_id) where draft_id is not null;

-- Atomic click counting for /r/[code].
create or replace function public.increment_link_clicks(p_code text)
returns void
language sql
set search_path = public
as $$
  update public.tracked_links set click_count = click_count + 1 where short_code = p_code;
$$;

-- Widen the service work order CHECK with the 'cancelled' terminal (stop machinery).
alter table public.service_work_orders drop constraint if exists service_work_orders_status_check;
alter table public.service_work_orders add constraint service_work_orders_status_check
  check (status in ('queued','claimed','in_progress','blocked_client','blocked_gate','ready_for_client','delivered','cancelled'));
