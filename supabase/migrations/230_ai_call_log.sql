-- The AI call log: every strategist call, verbatim, forever.
--
-- Law 4's little sibling (see CLAUDE.md, the strategist-flow constitution). The disagreement log --
-- what the AI proposed vs what a human changed -- can only exist if what the AI actually said was
-- kept. This table is written by ONE choke point (callStructuredOutput in planning/anthropic.ts),
-- which every planning AI call already flows through, so coverage is by construction rather than
-- by each route remembering to log.
--
-- Fire-and-forget: a failed insert never fails a call. Never read on any hot path.
--
-- APPLY IN THE SUPABASE DASHBOARD SQL EDITOR, not the CLI.

create table if not exists public.ai_call_log (
  id            uuid primary key default gen_random_uuid(),
  -- What kind of call this was ('select-mix', 'diagnose', 'recommend', ...). 'unknown' when an
  -- untagged caller flowed through; the log still keeps the call.
  kind          text not null default 'unknown',
  client_id     uuid,
  model         text not null,
  system_prompt text not null,
  user_prompt   text not null,
  schema_name   text,
  -- The model's verbatim output. Null when the call failed before an answer.
  response_text text,
  ok            boolean not null,
  -- Why it failed, when it did: 'no-key' | 'http-401' | 'http-402' | 'http-429' | 'http-5xx'
  -- | 'timeout' | 'unparseable'. Null on success.
  fail_class    text,
  latency_ms    integer,
  -- Owner revision 2: free to capture today, answers "what does a plan cost us to compose" forever.
  tokens_in     integer,
  tokens_out    integer,
  -- Dollars, estimated from the model's public per-token rates at call time. An estimate, not a bill.
  cost_estimate numeric(10, 6),
  created_at    timestamptz not null default now()
);

create index if not exists ai_call_log_kind_idx on public.ai_call_log (kind, created_at desc);
create index if not exists ai_call_log_client_idx on public.ai_call_log (client_id, created_at desc);
-- The loud-failure dedupe window reads "any recent failure of this class" (429 bursts).
create index if not exists ai_call_log_fail_idx on public.ai_call_log (fail_class, created_at desc) where fail_class is not null;

alter table public.ai_call_log enable row level security;

-- Admin-only, same posture as campaign_payments: writes come from the service role, reads from
-- admin tooling. Prompts can quote client data, so no owner-facing policy.
do $$ begin
  create policy ai_call_log_admin on public.ai_call_log
    for all using (is_admin()) with check (is_admin());
exception when duplicate_object then null; end $$;

comment on table public.ai_call_log is
  'Every planning AI call, verbatim, written by the callStructuredOutput choke point. Never read on a hot path.';
