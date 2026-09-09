-- ============================================================================
-- 264: one weekly note per client per week, forever
-- ============================================================================
-- The weekly note is the product's first recurring outbound message, and the
-- only asset it has is that the owner keeps opening it. Two things destroy
-- that: a message with nothing in it, and the same message arriving twice.
-- The composer refuses to send a quiet week; this table refuses the duplicate.
--
-- The UNIQUE (client_id, week) IS the guarantee, not a convention. The cron
-- inserts BEFORE it composes and treats a rejected insert as "already sent",
-- so a retry, a manual run and the scheduled run cannot stack up in an inbox.
-- ============================================================================

create table if not exists weekly_note_sends (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  week text not null,                       -- ISO week, e.g. '2026-W37'
  sent_at timestamptz not null default now(),
  unique (client_id, week)
);

create index if not exists weekly_note_sends_client
  on weekly_note_sends (client_id, week desc);

alter table weekly_note_sends enable row level security;

do $$ begin
  create policy weekly_note_sends_admin on weekly_note_sends
    for all using (is_admin()) with check (is_admin());
exception when duplicate_object then null; end $$;

comment on table weekly_note_sends is
  'One row per client per ISO week: this week''s note has been claimed. The '
  'unique constraint is the send-once guarantee; the cron claims the week '
  'before composing and reads a rejected insert as already sent.';

notify pgrst, 'reload schema';
