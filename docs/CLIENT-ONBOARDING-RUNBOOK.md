# Client onboarding runbook

How to take a new contract from "signed" to "the client is using the platform."

Use this every time you onboard a new client. Following the same path each
time means each client is provisioned identically and breaks the same way
when something goes wrong (which is far easier to debug than 11 different
provisioning paths).

---

## Pre-conditions

Before starting, confirm you have:

- [ ] Signed contract / proposal with services agreed
- [ ] Billing setup in Stripe (subscription created or invoice sent)
- [ ] Primary contact's name, email, role (owner / manager)
- [ ] Business name + slug (URL-safe, e.g. `yellowbee-market-cafe`)
- [ ] Industry / vertical (`restaurant`, `salon`, `gym`, `cafe`, etc.)
- [ ] At least one location (street, city, state, zip)
- [ ] Existing website URL (or note that one will be built)
- [ ] Social handles (Instagram, Facebook, TikTok, LinkedIn — whatever's relevant)
- [ ] Brand basics: primary color, accent color, brand voice notes
- [ ] List of which services they've subscribed to:
  - `social` — social media management
  - `website` — website management
  - `local_seo` — local SEO + Google Business Profile
  - `email_sms` — email/SMS marketing

If any of the above are missing, get them before continuing. Don't onboard with placeholders.

---

## Provisioning steps

### 1. Create the client record

Go to `/admin/clients` → click "Add client". Fill in:

- Name + slug (slug must be URL-safe and unique)
- Industry, location, website, contact info, socials
- **services_active** — check only the services they paid for
- Tier (if applicable) + monthly rate

Click Save. This creates rows in `clients` and `client_brands`.

### 2. Invite the primary contact

Open the client at `/admin/clients/<slug>`. Find the "Team" or "Users" tab.
Click "Invite user":

- Email (their work email)
- Name
- Role (`owner` for the primary contact, `contributor` for others)

This sends an email with a sign-up link. The link creates an `auth.users`
row + a `client_users` row linking them to this client.

### 3. Set up the website connection (if `website` is enrolled)

If the client has an existing site we'll integrate with:

- Open the "Website" tab in admin
- Set `external_site_url` to their domain
- Set `site_type` to `external_repo`
- Set `external_deploy_hook_url` to their Vercel deploy hook
- Confirm the site publishes `/apnosh-content.json` with `vertical`, `features`, and any `fields`
- Toggle `is_published` on

If we're building the site:
- Use the `apnosh new-site <slug>` scaffold (when built)
- Wire deploy hook + env vars
- Same checklist as above

See `docs/INTEGRATION-PLAYBOOK.md` for the full schema contract.

### 4. Connect their accounts

The client does this themselves once logged in, but you can do it on
their behalf during a kickoff call:

- Instagram + Facebook (Meta OAuth via "Connect Instagram")
- Google Business Profile
- Google Search Console
- Google Analytics
- TikTok / LinkedIn (if relevant)

These show in their `/dashboard/connected-accounts` view.

### 5. Seed initial content (if applicable)

For restaurants:

- Menu items (Banh Mi prices, sauces, etc.) via `menu_items` table or admin UI
- Daily specials via `client_specials` table or `/admin/clients/<slug>/...`

For all clients:

- Hours via location settings
- Brand assets (logo, hero photo, About Us photo) — upload via `/admin/clients/<slug>/tabs/assets-tab`

### 6. Smoke test as the client

Open an incognito window. Sign in as them (or use the magic-link they
got). Walk through:

- [ ] `/dashboard` loads without errors
- [ ] Sidebar shows ONLY their enrolled services (gating works)
- [ ] `/dashboard/profile` shows their business info correctly
- [ ] `/dashboard/connected-accounts` shows what's connected vs not
- [ ] If they have `website`: `/dashboard/website/manage` loads, shows their actual site data
- [ ] If they have `social`: `/dashboard/social/calendar` loads
- [ ] `/dashboard/messages` works (send a test message to ourselves)
- [ ] Mobile: open on a phone, all the above still work

**Sentry must be quiet during this run.** If anything errors out, fix
before handing the client the URL.

---

## Post-conditions

The client is considered "onboarded" when **all of these** are true:

- [ ] Their `client_users` row has `status = 'active'` (they signed in at least once)
- [ ] They've connected at least one account
- [ ] They've taken one action in the dashboard (edited copy, replied to a
      message, approved a deliverable, anything)
- [ ] They know who their primary point-of-contact at Apnosh is (write it
      in their first message thread)

Until all four are true, mark them as "in onboarding" in your CRM (or
admin notes tab). Don't count them as activated.

---

## Common pitfalls

**Sign-in invite goes to spam.** Use `noreply@apnosh.com` not a generic
gmail in the from address. Tell the client to whitelist it.

**Client tries to connect Instagram, hits Meta's "app not approved" wall.**
The Apnosh Meta App is in development mode. Add their IG handle as a
Tester in `developers.facebook.com → Apps → 972474978474759 → Roles`. Until
the app is in Live mode, every new client needs this manual step.
(Tracking in `docs/ERROR-MONITORING.md`-adjacent — Meta verification is
the long-term unlock.)

**Their `apnosh-content.json` has typos in `features`.** Unrecognized
feature values are silently dropped. If their dashboard is missing
expected tiles, check the `features` array spelling against
`DashboardFeature` in `src/lib/dashboard/dashboard-features.ts`.

**Their Vercel deploy hook is wrong.** Save fires successfully on the
portal but their site doesn't rebuild. Test the deploy hook with
`curl -X POST <hook-url>` and verify Vercel shows a new deployment.

**They get the `business_id` vs `client_id` confusion in older flows.**
Some legacy tables still use `business_id`. The dashboard normalizes
through joins; admin UI can be inconsistent. If something looks wrong,
check whether the surface uses `useBusiness()` or `useClient()`.

---

## What "onboarding 11 clients" looks like operationally

If each client takes ~1 hour following this runbook:

- Day 1-2: pre-conditions audit (who's missing what?). Ask each client
  for the missing data via Messages.
- Day 3: onboard 2-3 of the most engaged. Watch what they hit. Fix what
  surprises you.
- Day 4-5: onboard the next batch.
- Week 2: backfill the rest.

Do NOT onboard everyone in one batch. The first 2-3 will surface 90%
of the issues, and it's much easier to fix once and re-test than fix
mid-rollout while clients are watching.

---

## Future automation

- `apnosh new-site <slug>` CLI to scaffold a customer repo automatically
- Admin UI: a single "Onboard new client" wizard that walks through steps 1-5
- Pre-onboarding checklist auto-emailed to the contact ("here's what we
  need from you")
- Auto-detect when post-conditions are met and surface a "client is
  activated" badge in admin

These are 1-2 weeks of work each. Don't block onboarding on them; do
the manual flow now and automate as patterns settle.
