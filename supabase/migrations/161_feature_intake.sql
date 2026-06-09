-- Public "Get Featured" intake form submissions.
--
-- Restaurants apply (from the public marketing site at /featured) to be
-- featured by Apnosh. Anyone can submit without logging in; this is the
-- top-of-funnel lead capture. Admins review these in the portal/CRM.
--
-- Mirrors the vendor_applications (147) pattern: a dedicated public-intake
-- table kept separate from clients/leads so unqualified applications don't
-- pollute the live CRM. Approved leads get promoted by an admin out-of-band.
--
-- lead_score is computed server-side by a BEFORE INSERT trigger (the form
-- is a static page with no server of its own), so the score is set
-- consistently regardless of what the client sends.

create table if not exists feature_intake (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  -- Step 1: the basics
  restaurant_name text not null,
  contact_name text not null,
  role text not null,
  email text not null,
  phone text,
  neighborhood text not null,

  -- Step 2: their story
  concept text,
  years_open text,
  story text not null,

  -- Step 3: so we can make the feature count
  busy_quiet_times text,
  current_marketing text,
  magic_wand_fix text,
  primary_goal text,
  pays_for_marketing text,

  -- Step 4: last bit
  anything_else text,
  consent boolean not null default false,

  source text not null default 'intake_form',
  status text not null default 'new',
  lead_score text
);

create index if not exists feature_intake_created_idx
  on feature_intake (created_at desc);
create index if not exists feature_intake_score_idx
  on feature_intake (lead_score, created_at desc);


-- ============================================
-- Lead scoring
-- ============================================
-- Returns 'hot' | 'warm' | 'low'. Called by the BEFORE INSERT trigger.
--
-- hot:  decision-maker (Owner/Co-owner) AND consent AND
--       (pays for marketing via agency/freelancer OR named a magic-wand fix)
--       AND neighborhood is in the target cluster.
-- warm: decision-maker OR in the target cluster, but not fully hot.
-- low:  otherwise.

create or replace function public.feature_intake_score(
  p_role text,
  p_consent boolean,
  p_pays_for_marketing text,
  p_magic_wand_fix text,
  p_neighborhood text
) returns text
language plpgsql
immutable
as $$
declare
  -- TODO: fill with the real target-cluster neighborhoods (lowercased).
  -- While this is empty no lead can match the cluster, so the best a lead
  -- can score is 'warm'. Edit this single array to light up 'hot' scoring.
  target_clusters text[] := array[]::text[];

  is_decision_maker boolean;
  pays_agency_or_freelancer boolean;
  has_magic_wand boolean;
  in_cluster boolean;
begin
  is_decision_maker := lower(coalesce(p_role, '')) in ('owner', 'co-owner');

  pays_agency_or_freelancer := lower(coalesce(p_pays_for_marketing, '')) in (
    'yes — an agency', 'yes - an agency',
    'yes — a freelancer', 'yes - a freelancer'
  );

  has_magic_wand := length(trim(coalesce(p_magic_wand_fix, ''))) > 0;

  in_cluster := lower(trim(coalesce(p_neighborhood, ''))) = any (target_clusters);

  if is_decision_maker
     and coalesce(p_consent, false)
     and (pays_agency_or_freelancer or has_magic_wand)
     and in_cluster then
    return 'hot';
  elsif is_decision_maker or in_cluster then
    return 'warm';
  else
    return 'low';
  end if;
end;
$$;


create or replace function public.feature_intake_set_score()
returns trigger
language plpgsql
as $$
begin
  new.lead_score := public.feature_intake_score(
    new.role,
    new.consent,
    new.pays_for_marketing,
    new.magic_wand_fix,
    new.neighborhood
  );
  return new;
end;
$$;

drop trigger if exists feature_intake_score_trg on feature_intake;
create trigger feature_intake_score_trg
  before insert on feature_intake
  for each row
  execute function public.feature_intake_set_score();


-- ============================================
-- RLS: public funnel — anon insert, admin read
-- ============================================
alter table feature_intake enable row level security;

drop policy if exists "admin all feature intake" on feature_intake;
drop policy if exists "anyone inserts feature intake" on feature_intake;

create policy "admin all feature intake"
  on feature_intake for all
  using (is_admin()) with check (is_admin());

/* Anyone (signed in or anonymous) can submit — this is the public
   "Get Featured" funnel. Reads are gated to admins only. */
create policy "anyone inserts feature intake"
  on feature_intake for insert
  with check (true);

comment on table feature_intake is
  'Inbound "Get Featured" applications from the public site (/featured). Reviewed by admins in the CRM; qualified ones become leads/clients.';

-- TODO (downstream, out of scope here): add a Supabase Database Webhook on
-- INSERT to feature_intake that POSTs the row to the CRM/email automation
-- endpoint (configure FEATURE_INTAKE_WEBHOOK_URL when that consumer exists).

notify pgrst, 'reload schema';
