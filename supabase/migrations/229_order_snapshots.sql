-- 229_order_snapshots — an immutable record of exactly what was agreed, at the moment it was agreed.
--
-- WHY THIS IS NOT JUST THE CAMPAIGN. A campaign is a living thing: lines get added, removed, paused,
-- repriced, and the plan the owner actually said yes to stops being recoverable within a week. When
-- an owner asks "you're billing me for something I took out" or "that isn't the price I agreed",
-- today there is no artifact that answers it. The campaign rows have already moved on.
--
-- So this table freezes the answer. One row per accepted order, written once, never updated:
-- every line with its price and cadence, what was billed and what was held-but-not-billed, the
-- totals as they appeared on screen, which version of the terms was accepted, and what we had
-- believed about the business when we composed it.
--
-- The last one matters more than it looks. A plan built from a wrong "slow days" or a stale goal
-- produces a defensible-looking plan for the wrong restaurant; keeping the inputs means a bad plan
-- can be traced to the bad fact that caused it, rather than argued about.
--
-- IMMUTABILITY is enforced, not just intended: no UPDATE policy exists for anyone, including admins.
-- A snapshot that can be edited after the fact is not evidence of anything.

create table if not exists campaign_order_snapshots (
  id                 uuid primary key default uuid_generate_v4(),
  campaign_id        uuid not null references campaigns(id) on delete cascade,
  client_id          uuid not null references clients(id) on delete cascade,

  -- which words they accepted. Version, not a boolean: the text changes, and an acceptance that
  -- cannot be tied to specific wording proves nothing.
  agreement_version  text not null,
  agreed_at          timestamptz not null default now(),
  agreed_by          uuid references auth.users(id) on delete set null,

  -- what was agreed, frozen. lines[] mirrors the LineItem shape the draft carried, plus the held
  -- reason where a line rode along visibly and unbilled.
  lines              jsonb not null,
  -- { onceCents, monthlyCents } exactly as displayed. Cents, so no float drift in an audit record.
  bill               jsonb not null,
  -- what we believed when we composed it, and where each fact came from (onboarding / menu /
  -- connection / guessed). This is what makes a wrong plan traceable to the wrong input.
  inputs             jsonb,
  -- anything the owner changed by hand before accepting: { off: [...], added: [...] }
  edits              jsonb not null default '{}'::jsonb,

  created_at         timestamptz not null default now()
);

create index if not exists order_snapshots_campaign_idx on campaign_order_snapshots (campaign_id);
create index if not exists order_snapshots_client_idx   on campaign_order_snapshots (client_id, agreed_at desc);

alter table campaign_order_snapshots enable row level security;

-- Read: the client who owns it (either ownership path used across this schema), or an admin.
drop policy if exists order_snapshots_read on campaign_order_snapshots;
create policy order_snapshots_read on campaign_order_snapshots
  for select using (
    is_admin()
    or client_id in (select client_id from client_users where auth_user_id = auth.uid())
    or client_id in (select id from clients where id in (
         select client_id from businesses where owner_id = auth.uid()))
  );

-- Insert: server-side only (service role bypasses RLS). No client-side path writes these.
drop policy if exists order_snapshots_insert on campaign_order_snapshots;
create policy order_snapshots_insert on campaign_order_snapshots
  for insert with check (is_admin());

-- Deliberately NO update policy and NO delete policy for anyone, admins included. The whole value
-- of this row is that nobody can change it afterwards. Correcting a mistake means writing a new
-- snapshot and saying so, not quietly editing the old one.

comment on table campaign_order_snapshots is
  'Immutable record of what a client agreed to, when, and under which terms version. Never updated.';
