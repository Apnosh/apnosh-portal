-- Customer Eye View runs.
--
-- Stores each "if I were a hungry customer researching this place, what
-- would I find?" Claude-narrated report. One row per run. Output is
-- jsonb so the narrative shape can evolve (sections, screenshots, etc)
-- without migrations.
--
-- Initially run on-demand from /dashboard/customer-view; eventually a
-- weekly cron for Strategist tier clients.

create table if not exists customer_eye_view_runs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  ran_at timestamptz not null default now(),

  /* Persona used: 'local_customer' (default), 'tourist', 'press', etc.
     For now we always use 'local_customer'. */
  persona text not null default 'local_customer',

  /* The intent search that triggered the persona — e.g. "tacos near me"
     for a taqueria. Helps Claude anchor the narrative. */
  search_intent text,

  /* "Would I visit?" likelihood the AI gave at the end of the report,
     0-100. Tracked for trending over time. */
  visit_likelihood int,

  /* The narrative + structured findings. Shape (v1):
       {
         summary: string,
         firstImpressions: string,
         decisionJourney: string,
         frictionPoints: Array<{ source, observation, severity }>,
         trustSignals: Array<{ source, observation }>,
         verdict: string,
       }
     v2+ will add: screenshots[], competitorComparisons[]. */
  report jsonb not null,

  /* Token + cost accounting (similar to audit_runs). */
  model text,
  tokens_in int,
  tokens_out int,
  cost_cents int,

  /* Optional admin notes. */
  notes text
);

create index if not exists idx_cev_runs_client_recent
  on customer_eye_view_runs(client_id, ran_at desc);

comment on table customer_eye_view_runs is
  'AI-narrated "potential customer''s perspective" reports. v1: text-only, primary client. v2: screenshots. v3: competitor comparison.';
