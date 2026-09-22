-- 273: drafts (owner 2026-09-22): an idea with a date, not an order. status 'draft' on plan_slots:
-- costs nothing, the team never sees it, the nightly fill ignores it. Ship it fills an open slot
-- that day or becomes an extra. A draft may have no date yet (the Ideas shelf).
alter table public.plan_slots drop constraint if exists plan_slots_status_check;
alter table public.plan_slots add constraint plan_slots_status_check check (status in ('open','planned','minted','done','rolled','removed','draft'));
alter table public.plan_slots alter column date drop not null;
