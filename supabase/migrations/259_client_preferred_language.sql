-- 259: the language the owner reads the product in.
--
-- Ten of the twenty owners in the walk speak Spanish at home and run a taqueria, a pupuseria or
-- a panaderia. Every screen we hand them is in English, and three of them said out loud that
-- they could not tell what they were being charged for. Nothing on the client said what language
-- to draw in, so there was nowhere for an answer to go even if we asked.
--
-- One column, two values, English by default. 'en' is the default (not null) because that IS
-- what every existing owner is already being shown; a null here would mean "we do not know",
-- and we do know — they have been reading English since the day they signed up. The moment they
-- pick Spanish in Settings this flips, and the screens that have Spanish switch.
--
-- Move 5 removed a placeholder column of the same idea. This is the real one, and it is the one
-- src/lib/i18n reads.
--
-- Tenancy: keyed on clients. No business_id column, nothing NOT NULL added to another table.
-- Applied by hand in the Supabase SQL editor. Every writer is best-effort until it runs
-- (the settings PATCH swallows 42703 / PGRST204 with a warn and the owner keeps English).

alter table clients add column if not exists preferred_language text not null default 'en';

-- The check is added separately and guarded, so re-running this file on a database that already
-- has it does not error out.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'clients_preferred_language_check'
  ) then
    alter table clients
      add constraint clients_preferred_language_check
      check (preferred_language in ('en','es'));
  end if;
end $$;

comment on column clients.preferred_language is
  'The language this owner reads the product in: en or es. Read by src/lib/i18n, written from Settings.';

-- Make PostgREST see the new columns without a redeploy.
notify pgrst, 'reload schema';
