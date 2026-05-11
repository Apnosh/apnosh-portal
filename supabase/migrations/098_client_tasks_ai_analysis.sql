-- ─────────────────────────────────────────────────────────────
-- 098_client_tasks_ai_analysis.sql
--
-- Add ai_analysis jsonb to client_tasks so the AI quote-suggestion
-- pass run on request submission can stash its output. The strategist
-- queue (/admin/today) reads this to show a confidence badge:
--   - "In plan · 92%"
--   - "Quote $400 · 85%"
--   - "Needs review"
--
-- Shape (validated in app code, not DB):
-- {
--   recommendedAction: 'in_plan' | 'quote' | 'escalate',
--   confidence: number (0-1),
--   reasoning: string,
--   suggestedQuote?: {
--     title: string,
--     lineItems: [{ label, qty, unitPrice, total, notes? }],
--     strategistMessage: string,
--     estimatedTurnaroundDays: number
--   },
--   model: string,
--   analyzedAt: ISO timestamp
-- }
-- ─────────────────────────────────────────────────────────────

alter table client_tasks
  add column if not exists ai_analysis jsonb;

create index if not exists client_tasks_ai_analysis_idx
  on client_tasks((ai_analysis ->> 'recommendedAction'))
  where ai_analysis is not null;

comment on column client_tasks.ai_analysis is
  'AI-generated routing + quote suggestion run at request submission time. See /lib/admin/suggest-quote.ts for shape.';
