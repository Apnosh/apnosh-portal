-- 080_ai_generations.sql
-- Universal generation log for every AI call in the Site Builder. Powers
-- the data flywheel: every prompt run, every output, every AM decision
-- captured here. Used for:
--   - Few-shot retrieval (best published sites become future prompt examples)
--   - Eval harness (replay old prompts vs new prompts on real cases)
--   - Outcome telemetry (which prompts produce sites that get published quickly)
--   - Quality regression detection (when a model upgrade hurts output)

create table if not exists ai_generations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,

  -- ===== What was the call =====
  task_type text not null check (task_type in (
    'generate',     -- /api/admin/generate-site
    'recreate',     -- /api/admin/recreate-site
    'refine',       -- /api/admin/refine-site
    'extract',      -- /api/admin/extract-from-url
    'design',       -- /api/admin/design-claude
    'critique',     -- future critique pass
    'judge'         -- future LLM-as-judge eval
  )),
  prompt_id text,                  -- 'restaurant-recreate' etc (registry key)
  prompt_version text,             -- 'v1', 'v2' (when registry exists)
  model text not null,             -- e.g. 'claude-opus-4-1-20250805'

  -- ===== The data =====
  input_summary jsonb,             -- the user's prompt + scope + variant count, etc (NOT full system prompt)
  output_summary jsonb,            -- parsed structured result (variant or partial diff)
  raw_text text,                   -- full Claude response, for debugging + future re-evaluation

  -- ===== Variant grouping =====
  variant_index integer,           -- if part of multi-variant batch, which one (0, 1, 2)
  batch_id uuid,                   -- groups variants generated in the same call

  -- ===== Outcomes (the gold) =====
  picked boolean not null default false,        -- AM selected this variant
  applied boolean not null default false,       -- this output became part of draft_data
  refined_into_id uuid references ai_generations(id) on delete set null,  -- next-pass refinement
  published_history_id uuid references site_publish_history(id) on delete set null,  -- shipped

  -- ===== Telemetry =====
  latency_ms integer,
  input_tokens integer,
  output_tokens integer,
  error_message text,

  -- ===== Quality (filled later by eval harness) =====
  ai_judge_score numeric(3, 1),    -- 1-10
  ai_judge_breakdown jsonb,        -- per-axis scores: { hero: 8, voice: 7, design: 9 }
  human_feedback text,             -- AM notes

  -- ===== Audit =====
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists ai_generations_client_idx on ai_generations(client_id, created_at desc);
create index if not exists ai_generations_task_idx on ai_generations(task_type, created_at desc);
create index if not exists ai_generations_batch_idx on ai_generations(batch_id) where batch_id is not null;
create index if not exists ai_generations_picked_idx on ai_generations(picked) where picked = true;
create index if not exists ai_generations_published_idx on ai_generations(published_history_id) where published_history_id is not null;

comment on table ai_generations is
  'Universal log of every AI call + AM outcome. Powers few-shot retrieval, evals, and telemetry. Single source of truth for AI quality work.';

-- ============================================================================
-- RLS: admin-only (this is internal product telemetry, not client-facing)
-- ============================================================================

alter table ai_generations enable row level security;

drop policy if exists "ai_generations: admin all" on ai_generations;
create policy "ai_generations: admin all" on ai_generations
  for all
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );
