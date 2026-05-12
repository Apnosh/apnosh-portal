-- Adds retrieved_judgments to ai_generation_inputs so we can audit
-- which human_judgments influenced a given AI generation. The prompt
-- text already captures the rejection patterns, but a queryable column
-- lets us answer "which generations were shaped by judgment X?" without
-- text-grepping prompts.

alter table ai_generation_inputs
  add column if not exists retrieved_judgments uuid[] not null default '{}';

comment on column ai_generation_inputs.retrieved_judgments is
  'human_judgments.id values that were surfaced into the prompt as rejection patterns. Aligns with retrieved_facts / retrieved_posts / retrieved_drafts for full retrieval provenance.';
