-- 270: the month's subject (owner 2026-09-21): "Fall menu", "Halloween". Drives the words on every piece.
alter table public.plan_months add column if not exists subject text;
