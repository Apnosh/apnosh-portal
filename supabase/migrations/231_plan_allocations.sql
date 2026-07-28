-- The allocation record: what the strategist saw, what it proposed, what actually shipped.
--
-- Law 4 of the strategist-flow constitution (CLAUDE.md): record the allocation at mint. The first
-- cohort of real campaigns is the only training set this system will ever have -- the learned
-- weights, the disagreement log (AI proposal vs owner's final), and every future "did our advice
-- work" claim all read from here. It is nearly free to write at mint and unrecoverable if skipped.
--
-- ITS OWN TABLE, NOT A COLUMN ON campaigns: this is an append-only audit. A campaign edited and
-- re-shipped produces multiple rows; the hot campaigns table stays untouched.
--
-- PROVENANCE IS PART OF THE RECORD (owner revision 1): `signals_at` says WHEN the signals snapshot
-- was taken. 'compose' means it is genuinely what the strategist saw when it proposed the plan;
-- 'mint' is the explicit fallback (re-fetched at ship time, possibly days later) and must never be
-- passed off as the former.
--
-- APPLY IN THE SUPABASE DASHBOARD SQL EDITOR, not the CLI.

create table if not exists public.plan_allocations (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid references public.campaigns(id) on delete set null,
  client_id    uuid not null,
  goal         text not null,
  -- Which brain path composed it: 'tailored' | 'safe'. What the routing decided for this client.
  route        text,
  -- The plan AS PROPOSED, before any owner edit. The other half of the disagreement log.
  composed     jsonb not null,
  -- The items that actually minted, with prices, producers and lanes as finally chosen.
  final_items  jsonb not null,
  -- The routing decisions: producer choices, owner overrides, creator picks.
  choices      jsonb not null default '{}'::jsonb,
  -- The BrainSignals snapshot the strategist worked from.
  signals      jsonb not null,
  -- 'compose' | 'mint'. See header. The reader must be able to trust 'compose' absolutely.
  signals_at   text not null default 'compose' check (signals_at in ('compose', 'mint')),
  -- Stub for the learning loop: filled by the outcomes poll long after mint. Null until then.
  outcome      jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists plan_allocations_campaign_idx on public.plan_allocations (campaign_id);
create index if not exists plan_allocations_client_idx on public.plan_allocations (client_id, created_at desc);

alter table public.plan_allocations enable row level security;

do $$ begin
  create policy plan_allocations_admin on public.plan_allocations
    for all using (is_admin()) with check (is_admin());
exception when duplicate_object then null; end $$;

comment on table public.plan_allocations is
  'Append-only: inputs -> recommendation -> final plan -> outcome, per mint. The training set.';
