-- ============================================================
-- Migration 060: client_health view (signal-level, no composite score)
-- ============================================================
-- Three honest signals per client, each with a level:
--   - cadence  : are we talking? (days since last interaction vs typical)
--   - billing  : is money flowing? (subscription + overdue invoices)
--   - sentiment: are they happy? (negative signals in last 5 interactions)
--
-- We deliberately DO NOT roll these into a 0-100 score. A composite
-- number hides the signal, weights are arbitrary, and it invites
-- Goodhart gaming. The overall "status" is just the worst of the three,
-- displayed alongside each individual signal.
--
-- Engagement (portal logins, message replies) is a fourth signal we
-- want but can't measure cleanly yet — deferred until we track login
-- activity on client_users.
-- ============================================================

create or replace view client_health as
with clients_base as (
  select id, name, slug from clients
),

-- ─── Cadence: interactions per client ───────────────────────────
interaction_stats as (
  select
    client_id,
    count(*) as interaction_count,
    max(occurred_at) as last_contact_at,
    extract(epoch from (now() - max(occurred_at))) / 86400.0 as days_since_contact
  from client_interactions
  group by client_id
),
-- Rolling median of inter-interaction intervals — our best stand-in
-- for "how often does this client usually touch us?"
interaction_intervals as (
  select
    client_id,
    occurred_at,
    lag(occurred_at) over (partition by client_id order by occurred_at) as prev
  from client_interactions
),
cadence_medians as (
  select
    client_id,
    percentile_cont(0.5) within group (
      order by extract(epoch from (occurred_at - prev)) / 86400.0
    ) as median_interval_days
  from interaction_intervals
  where prev is not null
  group by client_id
),

-- ─── Billing: subscription + invoice state ──────────────────────
billing_state as (
  select
    c.id as client_id,
    (select exists (
      select 1 from subscriptions s
      where s.client_id = c.id
        and s.status in ('active', 'trialing', 'past_due', 'paused')
    )) as has_active_sub,
    -- Previously had a subscription but it's now canceled AND nothing active.
    (select exists (
      select 1 from subscriptions s
      where s.client_id = c.id
    ) and not exists (
      select 1 from subscriptions s
      where s.client_id = c.id
        and s.status in ('active', 'trialing', 'past_due', 'paused')
    )) as only_canceled,
    (select count(*) from invoices i
      where i.client_id = c.id
        and i.status = 'failed') as failed_count,
    (select max(extract(epoch from (now() - i.due_at)) / 86400.0)
      from invoices i
      where i.client_id = c.id
        and i.status in ('open', 'failed')
        and i.due_at is not null
        and i.due_at < now()) as max_overdue_days,
    (select count(*) from invoices i
      where i.client_id = c.id
        and i.status in ('open', 'failed')
        and i.due_at is not null
        and i.due_at < now()) as overdue_count,
    (select exists (
      select 1 from invoices i where i.client_id = c.id
    )) as has_any_invoices
  from clients_base c
),

-- ─── Sentiment: most recent interactions with a sentiment set ───
sentiment_recent as (
  select
    client_id,
    sentiment,
    occurred_at,
    row_number() over (partition by client_id order by occurred_at desc) as rn
  from client_interactions
  where sentiment is not null
),
sentiment_counts as (
  select
    client_id,
    sum(case when rn <= 5 and sentiment = 'negative' then 1 else 0 end) as negatives_last_5,
    sum(case when rn <= 3 and sentiment = 'negative' then 1 else 0 end) as negatives_last_3,
    sum(case when rn <= 5 and sentiment = 'positive' then 1 else 0 end) as positives_last_5,
    sum(case when rn <= 5 then 1 else 0 end) as sentiment_count
  from sentiment_recent
  group by client_id
)

select
  c.id as client_id,
  c.name,
  c.slug,

  -- ─── Cadence signal ───
  case
    when coalesce(i.interaction_count, 0) < 3 then 'unknown'
    when i.days_since_contact is null then 'unknown'
    when i.days_since_contact <= coalesce(cm.median_interval_days, 14) * 1.5 then 'good'
    when i.days_since_contact <= coalesce(cm.median_interval_days, 14) * 2.5 then 'warning'
    else 'bad'
  end as cadence_level,
  i.last_contact_at,
  i.days_since_contact::numeric(10, 1) as days_since_contact,
  cm.median_interval_days::numeric(10, 1) as cadence_median_days,
  i.interaction_count,

  -- ─── Billing signal ───
  case
    when not b.has_any_invoices and not b.has_active_sub then 'unknown'
    when b.only_canceled then 'bad'
    when b.failed_count > 0 or coalesce(b.max_overdue_days, 0) > 30 then 'bad'
    when coalesce(b.max_overdue_days, 0) > 0 then 'warning'
    when b.has_active_sub then 'good'
    else 'unknown'
  end as billing_level,
  b.overdue_count as billing_overdue_count,
  b.max_overdue_days::numeric(10, 1) as billing_max_overdue_days,
  b.has_active_sub as billing_has_active_sub,
  b.failed_count as billing_failed_count,

  -- ─── Sentiment signal ───
  case
    when coalesce(sc.sentiment_count, 0) = 0 then 'unknown'
    when coalesce(sc.negatives_last_5, 0) >= 2 then 'bad'
    when coalesce(sc.negatives_last_3, 0) >= 1 then 'warning'
    else 'good'
  end as sentiment_level,
  sc.negatives_last_5,
  sc.positives_last_5,
  sc.sentiment_count

from clients_base c
left join interaction_stats i on i.client_id = c.id
left join cadence_medians cm on cm.client_id = c.id
left join billing_state b on b.client_id = c.id
left join sentiment_counts sc on sc.client_id = c.id;

-- Views inherit RLS from underlying tables, but we also want to grant
-- authenticated access explicitly so admin + client clients can query it.
-- The policies on client_interactions / invoices / subscriptions already
-- gate by client_id for non-admins, so clients only see their own row.
grant select on client_health to authenticated;

comment on view client_health is
  'Per-client signal levels (cadence / billing / sentiment). '
  'Each signal is good | warning | bad | unknown. '
  'Overall status is the worst of the three. No composite 0-100 score '
  'by design — display signals individually; let the admin synthesize.';
