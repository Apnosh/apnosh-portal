-- Newsletter subscriber list.
--
-- The canonical opt-in list for the Apnosh newsletter. It is intentionally a
-- standalone table (not a column on feature_intake) so it can be fed from many
-- sources over time — the "Get Featured" form, a future footer signup, events —
-- and exported wholesale to whatever email tool sends the newsletter.
--
-- Consent is explicit and unbundled: the public form adds subscribers only when
-- a separate, optional, unchecked box is ticked. Anyone can subscribe without
-- logging in; admins read/manage the list.
--
-- Dedupe is on lower(email): a unique index means re-subscribing the same
-- address simply raises a unique_violation, which the client treats as
-- "already subscribed" rather than an error.

create table if not exists newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  email text not null,
  name text,

  source text not null default 'featured_form',
  status text not null default 'subscribed',  -- subscribed | unsubscribed
  consented_at timestamptz not null default now()
);

-- Case-insensitive uniqueness so "Owner@x.com" and "owner@x.com" are one person.
create unique index if not exists newsletter_subscribers_email_uidx
  on newsletter_subscribers (lower(email));

create index if not exists newsletter_subscribers_created_idx
  on newsletter_subscribers (created_at desc);


-- ============================================
-- RLS: public funnel — anon insert, admin manage
-- ============================================
alter table newsletter_subscribers enable row level security;

drop policy if exists "admin all newsletter subscribers" on newsletter_subscribers;
drop policy if exists "anyone subscribes newsletter" on newsletter_subscribers;

create policy "admin all newsletter subscribers"
  on newsletter_subscribers for all
  using (is_admin()) with check (is_admin());

/* Anyone (signed in or anonymous) can subscribe — this is a public opt-in.
   Inserts only: no anon update/delete, so the list can't be tampered with.
   Reads and status changes (unsubscribe handling) are gated to admins. */
create policy "anyone subscribes newsletter"
  on newsletter_subscribers for insert
  with check (true);

comment on table newsletter_subscribers is
  'Opt-in newsletter list. Fed by public signups (currently the /featured form); exported to the email tool that sends the newsletter.';

notify pgrst, 'reload schema';
