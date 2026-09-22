-- 272: slots (owner 2026-09-22): content ordered ahead is a slot. It starts OPEN (paid, blank),
-- becomes SET when someone says what it is about, LOCKS when a maker has it or three days out,
-- and is DONE when it is out. subject = what it is about; campaign = the one-off it belongs to
-- (a holiday id, an announcement id); history = every fill / swap / push / scrap; rate = plan
-- (the standing order) or oneoff (an extra at list price).
alter table public.plan_slots add column if not exists fill text not null default 'open' check (fill in ('open','set','locked','done'));
alter table public.plan_slots add column if not exists subject text;
alter table public.plan_slots add column if not exists campaign text;
alter table public.plan_slots add column if not exists history jsonb not null default '[]'::jsonb;
alter table public.plan_slots add column if not exists rate text not null default 'plan' check (rate in ('plan','oneoff'));
