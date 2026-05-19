-- Add Claude-generated narrative + cuisine context to audit_runs.

alter table audit_runs add column if not exists narrative text;
alter table audit_runs add column if not exists narrative_model text;
alter table audit_runs add column if not exists narrative_tokens_in int;
alter table audit_runs add column if not exists narrative_tokens_out int;

comment on column audit_runs.narrative is
  'Claude-generated 3-sentence personalized summary synthesizing the findings.';
