-- 260: the report that gets SENT, and the win a person can show a friend.
--
-- Two small things, both about an owner getting something back for what they bought.
--
-- 1. owner_reports. The monthly report has existed for a while and nobody was ever told it was
--    there: the banner only shows if the owner already opened Home in the first two weeks of the
--    month. The cron that emails it needs one row to say "this client has been sent this month",
--    or a retry, an overlapping run, or a manual run would mail the same owner the same report
--    two and three times. The unique (client_id, month) IS the dedupe: the insert either wins the
--    month or it conflicts, and only the winner sends. opened_at is stamped when the impact page
--    loads with the ?m= that email carried, so staff can see whether the push was read.
--
--    month is text 'YYYY-MM', not a date, because that is exactly what the link carries (?m=) and
--    what buildMonthlyReport is asked for. A date would invite a timezone to decide which month a
--    report was, which is the one thing a monthly report must never be unsure about.
--
-- 2. proof_cards.share_token. A win the owner cannot show anyone is only half a win. The token is
--    minted the FIRST time they share a card and never changes after; the public page at /w/<token>
--    reads exactly one card by it, and carries the business name and nothing else about the client.
--    Nullable on purpose: a card nobody shared has no public address at all, which is the safest
--    default a share link can have. Unique so a token can never point at two cards.
--
-- Tenancy: owner_reports is keyed on client_id. No business_id column, nothing NOT NULL added to
-- another table. Applied by hand in the Supabase SQL editor (project_supabase_migrations).
-- Every writer is best-effort until it runs: the cron refuses to send without the dedupe row and
-- says which SQL is missing, the opened_at stamp swallows 42703, and sharing falls back to the
-- in-app copy when the column is absent.

create table if not exists owner_reports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  month text not null,                                  -- the month the report covers, 'YYYY-MM'
  sent_at timestamptz not null default now(),
  opened_at timestamptz,                                -- they opened it from the email
  created_at timestamptz not null default now(),
  unique (client_id, month)
);
create index if not exists owner_reports_client_month on owner_reports (client_id, month desc);

alter table owner_reports enable row level security;
do $$ begin
  create policy owner_reports_admin on owner_reports
    for all using (is_admin()) with check (is_admin());
exception when duplicate_object then null; end $$;

-- An owner's row usually lives on businesses, not client_users, so the read policy looks at both —
-- the same order the app resolves a client by (src/lib/auth/client-access.ts). Dropped first so
-- re-running this file updates an older, narrower copy.
drop policy if exists owner_reports_client_read on owner_reports;
create policy owner_reports_client_read on owner_reports
  for select using (
    exists (select 1 from client_users cu where cu.client_id = owner_reports.client_id and cu.auth_user_id = auth.uid())
    or exists (select 1 from businesses b where b.client_id = owner_reports.client_id and b.owner_id = auth.uid())
  );

comment on table owner_reports is
  'One row per client per month: the monthly report was emailed, and whether the owner opened it. The unique (client_id, month) is the send-once dedupe.';

-- ── the share link on a win ───────────────────────────────────────────────────
-- Minted on first share, never rotated, null until then. A partial unique index (not a unique
-- constraint) so the many un-shared cards keep their nulls without fighting over them.
alter table proof_cards add column if not exists share_token text;
create unique index if not exists proof_cards_share_token_key
  on proof_cards (share_token) where share_token is not null;

comment on column proof_cards.share_token is
  'The public address of this win at /w/<token>. Minted the first time the owner shares it; null means the card has never been shared and has no public page.';

-- PostgREST caches the schema; without this the new table and column read as missing until it reloads.
notify pgrst, 'reload schema';
