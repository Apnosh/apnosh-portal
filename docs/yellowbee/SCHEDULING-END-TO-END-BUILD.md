# Yellowbee Scheduling — end-to-end build plan

**Prepared:** 2026-09-24 by Apnosh (Mark) with Claude, from the Yellow Bee developer handoff package
(prototype 0.6.1 and 0.6.0 source, guides, seed, screenshots, transcript U1–U8, DECISIONS.md) and
the September 2026 workbook (26 weekly sheets, latest 0920-0926).
**Supersedes:** `SCHEDULING-BUILD-PROMPT.md` sections 3–12 where they disagree (week start, roles,
swap approval, time clock). That file stays as history; this one is what gets built.
**Audience:** Mark (builder), Brian Hoang (owner), and any Claude Code session that starts the build.

---

## 0. The short version

**What exists.** A working, locally tested prototype (Node 22 + SQLite, ~270 KB of code, 294
passing API tests, 97 browser checks) that already does almost everything Brian asked for in U1–U7:
three account tiers, multi-store membership, per-store schedules, budgets with reasoned overrides,
staffing targets with red/yellow cues, Analytics, availability publishing, shift release and
pickup, store-team SMS outbox (Twilio, disabled), workbook Merge/Replace import, member removal.
It has never been hosted, no real account has ever logged in, and no text has ever been sent.

**What is missing to "work fully end to end for all accounts."**

1. A real login for real people. The prototype has email + password with hand-copied invitation
   links, no automated invite delivery, no password reset, no phone login. The roster has no
   emails or phones, so nobody can be invited today.
2. Hosting, backups, a domain, HTTPS. None exist.
3. SMS that actually sends. Needs a Twilio account owned by Yellow Bee, A2P 10DLC registration
   (2–4 weeks lead time), staff consent, and a real-device test.
4. Six owner decisions that change behaviour (section 3). The two prototype branches disagree on
   import semantics; the September 16 brief disagreed with the prototype on swaps, week start,
   roles, and availability approval.
5. A maintainable codebase. The prototype stores the entire app as one JSON blob in one SQLite
   row, re-serialised on every write, on one process, in dense generated code. Fine for a pilot,
   not a product Apnosh can keep evolving.

**Recommendation.** Rebuild on the Apnosh stack (Next.js 16 + Supabase + Vercel), treating the
0.6.1 prototype as the executable specification: its permission matrix is the law, its
`engine.js` rules port function by function, and its 294 test names become the acceptance suite.
Do **not** add the brief's extras the owner never asked for (time clock, geofence, payroll,
wages, Monday weeks, 60-minute travel buffer, manager-approved swaps, owner-defined station
roles). Ship what Brian asked for, working for every account type, then extend.

**Optional bridge.** If the rebuild will take longer than ~6 weeks, host prototype 0.6.1 on a small
VPS now (one day of work, section 10) so Brian and the store manager use it for real while the
rebuild happens. Real usage settles the section 3 decisions faster than a meeting.

---

## 1. Who the users are and what each one can do

### 1.1 The three tiers, and the states around them

Authority is **tier + store scope**, evaluated on every request. A job title never grants access.

| Situation | Tier | Sees | Example |
|---|---|---|---|
| Owner / back office, no shifts | Administrator, no roster | Every store, every admin screen | Brian; an Apnosh support login |
| Owner who also works shifts | Administrator, on roster | Everything, plus "My schedule" | Brian if he schedules himself |
| Store manager at their store | Manager, `manages = true` at that store | All 8 manager workspaces for that store | Emma at YB1 |
| Same manager at another store they only work at | Manager, member of store, `manages = false` | Member self-service only, with a notice and a link back to their managed store | Emma picking up a shift at YB2 |
| Crew | Member of ≥1 store | My schedule, My availability, Shift Release & Available, Text alerts | Everyone else |
| On the roster, never invited | Any tier, no login | Nothing (no account). Still scheduled, still counted | Most of the imported 22 |
| Invited, not yet accepted | Any tier | Nothing until they accept | |
| Removed from one store, active at another | Unchanged | That store disappears; the other keeps working | Shared staff |
| Historical (left the business) | Access revoked, history kept | Nothing. Past shifts, hours, and analytics keep their name | Departed staff |
| Store archived | — | Store hidden from selectors; admins can still read its history | |

Rules that fall out of the prototype and Brian's messages, all of which the new build keeps:

- Tier changes take effect **immediately in existing sessions**, no re-invite.
- A Manager must be a member of every store they manage. Administrators manage all stores
  without membership.
- An active Member needs at least one active store. An active Manager needs at least one
  managed store.
- Removing someone requires resolving their **future** draft and published shifts first,
  including shifts they have offered up but nobody has claimed.
- Removal archives access and membership. It never deletes shifts, hours, or names from history.
- A person cannot change their own tier, stores, managed flags, roster status, or another
  person's anything through a self-profile save.
- Import never grants a tier, never transfers SMS consent to an unverified number, never revives a
  removed person.
- The prototype's "Emma repair" (name + legacy ID match) is not ported. Emma gets Manager at YB1
  by the administrator ticking the box on go-live day.

### 1.2 The permission matrix (the law)

Operation-level, not "manager can write everything at their store". "Managed store" means a store
where the actor has `manages = true`. "Assigned store" means active membership.

| Operation | Administrator | Manager (managed store) | Manager (assigned, not managed) | Member |
|---|---|---|---|---|
| Create, edit, rename, archive stores | ✅ all | ❌ | ❌ | ❌ |
| Add employee record | ✅ | ❌ | ❌ | ❌ |
| Invite / re-invite / reset login | ✅ | ❌ | ❌ | ❌ |
| Set account tier, store memberships, managed flags | ✅ | ❌ | ❌ | ❌ |
| Set the Manager job function | ✅ | ❌ | ❌ | ❌ |
| Set Assistant Manager / Shift Lead / Front / Kitchen / Grocery | ✅ | ✅ member-tier staff at that store only | ❌ | ❌ |
| Edit another person's contact info or SMS consent | ✅ | ❌ | ❌ | ❌ |
| Set / change / remove weekly hours budget | ✅ | ❌ | ❌ | ❌ |
| Reasoned over-budget exception (save, create week, publish, import, assign) | ✅ | ✅ | ❌ | ❌ |
| Create week, copy week, edit shifts, publish | ✅ | ✅ | ❌ | ❌ |
| Edit staffing targets | ✅ | ✅ | ❌ | ❌ |
| Analytics for a store | ✅ | ✅ | ❌ | ❌ |
| Team notifications history and enrollment for a store | ✅ | ✅ | ❌ | ❌ |
| Release / withdraw / assign a shift on someone's behalf | ✅ | ✅ | ❌ | ❌ |
| Review legacy pending availability submissions | ✅ | ✅ submitted at that store | ❌ | ❌ |
| Remove a member from a store | ✅ any non-admin, any/all stores | ✅ member-tier only, that store only | ❌ | ❌ |
| Workbook import preview / commit; export data backup; read audit | ✅ | ❌ | ❌ | ❌ |
| View own published shifts | ✅ if on roster | ✅ | ✅ | ✅ |
| Publish own availability and preferences | ✅ if on roster | ✅ | ✅ | ✅ |
| Offer own future published shift; pick up an eligible offer | ✅ if on roster | ✅ | ✅ | ✅ |
| Set own phone + SMS opt-in | ✅ if on roster | ✅ | ✅ | ✅ |
| See other people's private notes, contacts, drafts, budgets | ✅ | ✅ at managed store (not contacts of other stores) | ❌ | ❌ |

What a Member can see of colleagues: names, job function at the shared store, and the shift
details of an **offered** shift. Never phone, email, notes, draft schedules, hours totals, or
budgets.

### 1.3 Identity: roster record vs login

Two things, linked, never merged:

- **Employee** (roster identity): stable ID, name, legacy workbook ID, tier, store memberships,
  job functions, roster status. Exists before, without, and after a login.
- **Login** (Supabase `auth.users`): email and/or phone. Linked to exactly one employee by
  `employees.user_id`. Created only by accepting an invitation whose destination matches.

A standalone administrator is an employee row with `roster_status = 'no_roster'` so there is
exactly one place authority lives. Name-only matching never links a login to an employee.

### 1.4 How people log in (decision A, default given)

Supabase Auth, both channels enabled:

- **Managers and administrators:** email + password, with magic-link reset.
- **Crew:** phone number + 6-digit SMS code (Supabase phone OTP via Twilio Verify). No password.
  Email + password also allowed for anyone who prefers it.

Invitation flow: administrator enters a phone or email on the employee record and clicks Invite.
The app sends the invite (SMS or email) itself; no more copying links by hand. The link opens an
accept page that asks for the code, links the login to that employee, and lands on My schedule.
Single-use, expires in 7 days, re-issuable. Changing tier or stores later never needs a new invite.

---

## 2. Scope of v1 (what "works fully" means)

Everything Brian asked for in U1–U7, plus what going live needs. Nothing else.

### 2.1 Stores and roster (U5, U6, U7)
- Locations & access: add, edit, archive stores (archive blocked while future shifts exist).
- Team members: add employee, set tier, per-store membership + job function + "manages this
  store", roster status, tags (Training, Vacation note), exclude-from-adjusted flag, phone,
  email, SMS consent record. "Workspace access after saving" preview panel. Remove member with
  the scoped confirmation and future-shift guard. Invite button with delivery status.
- Six job functions plus Unassigned, per store. Legacy custom labels preserved.

### 2.2 Weekly schedule (U1, U2, U3, U6)
- Sunday–Saturday weeks, one per store per week, separate IDs. Employee-row grid, click to add
  or edit a shift (start, end, unpaid break minutes, notes). Same-day shifts allowed, overnight
  shifts rejected (matches prototype and workbook).
- New week: empty or copy of a prior week. Inherits budget and targets from the closest earlier
  saved week **at that store**. Never inherits overrides.
- Hard blocks: overlapping shifts for one person across all stores (saved or published);
  scheduling a non-member; a shift on a date the person has published as unavailable. Adjacent
  shifts allowed. No travel buffer.
- Weekly hours review at 40 combined hours across stores: warning + reason to proceed (planning
  threshold, not an overtime calculation).
- Weekly hours budget: administrator sets per store per week; blank = no cap, zero = real zero.
  Any operation that raises gross scheduled hours above the cap (save, create/copy, publish,
  import, assisted assignment) is rejected unless the actor gives a reason and confirms. The
  override is tied to that operation and revision; it cannot be reused. Reducing hours never
  needs one. Budget changes and overrides show in History and the audit log.
- Publish: snapshot of shifts + budget. Later draft edits stay private until republished.
  Staff see only published shifts. Publication revalidates cross-store collisions.
- Dashboard cards: scheduled (gross) hours, adjusted hours (excluding flagged people), shifts,
  review items. Print and CSV export.

### 2.3 Staffing coverage (U6)
- Headcount per checkpoint (07:30, 08:00, 09:00 … 20:00, 20:30; per-store list) per weekday,
  start inclusive, end exclusive. Targets per week per weekday per checkpoint. Zero is a real
  target; blank is "not set".
- Above target = red. Below = amber. Not set = yellow pulse with a static "Not set" label and a
  reduced-motion fallback. Indicators do not block publish.
- New weeks copy the latest same-store targets. Editing a later week never rewrites earlier ones.

### 2.4 Availability (U1, U6)
- Recurring weekly windows (one window per day, or unavailable), date-specific overrides
  (available window or off), preferred min/max weekly hours, preferred times. Effective-from date.
- Button is **Publish My Availability**, for members and managers. Publishes immediately, no
  approval. Applies across all the person's stores.
- Publishing never cancels or moves an existing shift. If a published week now conflicts, the
  manager sees a warning on that shift.
- Legacy "pending" submissions (from the prototype, if any survive migration) keep a review
  screen for the store they were submitted at. New submissions never enter that state.
- Preferences are warnings for the manager, never guarantees.

### 2.5 Shift Release & Available (U4)
- A person offers their own **future, published** shift. They stay assigned and responsible.
- Eligible pickup: active member of that store, matching job function at that store, no overlap
  anywhere, not blocked by their published availability, not the same person, offer still open.
  The first eligible confirm wins; the transfer updates the draft and published copy of that one
  shift in one transaction and conserves hours, break, budget, and publish timestamp. Nobody else's
  draft edits leak.
- No manager approval step (decision C default). A per-store toggle "require manager approval
  for pickups" ships off; if Brian turns it on, pickup goes to "accepted, awaiting manager" and
  the manager approves or declines with a note.
- Withdraw an offer; manager can release on someone's behalf and assign an eligible teammate
  (with the hours-review reason where it applies). Offers close automatically when the shift
  starts, is deleted, or is edited.
- Shift board shows offers for the selected store with the coworker's name and the shift, nothing
  private.

### 2.6 Notifications (U4)
- Events: shift released, shift picked up (team-wide, that store, per U4); week published or
  republished (one summary to each affected person, not one text per shift); pickup approved or
  declined if the toggle is on.
- Recipients: the store's active, assigned, **SMS-opted-in** team. Standalone admins with no
  roster record get nothing. Skipped recipients (no number, no consent, duplicate number) are
  recorded, not hidden.
- Durable outbox: event + recipient rows commit in the same transaction as the schedule change;
  unique per (event, employee); dispatch rechecks membership and consent; provider ID and final
  status stored; "accepted by Twilio" is not shown as "delivered"; stale offers cancel their
  unsent messages; unknown after 24 h is recorded as unknown.
- In-app notification feed for the same events (works before Twilio is live).
- Consent: self-service under Text alerts (number, opt-in, date, policy version) or recorded by an
  administrator with a note of how the person agreed. Changing the number requires new consent.
- Twilio Messaging Service with A2P 10DLC registration in Yellow Bee's name; STOP/HELP handled by
  Twilio. Status via webhook (signature-validated with the official SDK) with polling fallback.

### 2.7 Analytics (U3)
- Per store: hours vs budget over time, over-budget weeks count, four-week moving average
  (requires four consecutive weeks), weekday pattern, job-function breakdown (current functions),
  employee hours and shift counts, weekly table. Filters: 4/8/13/26 weeks, all, custom range;
  job function; saved vs published basis. Missing budgets are excluded, never treated as zero.
  CSV export with store name. No wages anywhere.

### 2.8 Workbook import (U6)
- Administrator only. Upload .xls or .xlsx (cap 8 MB). Read-only preview bound to actor, file
  hash, scope, and current revision; expires in 15 minutes; single-use.
- Layouts: the Yellow Bee weekly grid (name row + start/end row pairs, Sunday–Saturday, optional
  targets block) and a shift table (Employee, Date, Start, End, optional Email, Phone, Employee
  ID, Job Role, Notes, Unpaid break). Optional Employees sheet for contacts.
- Modes: **Merge** (default) into the selected store, latest week or all weeks; **Replace this
  store's schedules** behind typed confirmation and impact summary. No all-store reset in the UI
  (decision D default); an all-store reset is a migration script Mark runs, not a button.
- Merge semantics (decision D): match people by legacy ID, then email, then unique exact name;
  ambiguous names fail the whole import. On the weekly grid, a blank day for an included person
  means off and removes that draft day. Invalid employee-days (missing end, formula text) keep the
  existing shifts and require acknowledgement. Published copies are untouched; imported data is
  draft. Budget cap still applies with override. Repeat import of the same file changes nothing.
- Backup before commit, all-or-nothing commit, import history with counts, audit row.
- Contact columns update contact records only; never tier, consent, or removal status.

### 2.9 Administration and safety
- Audit log for every mutation: actor, action, entity, store, before/after (contacts redacted),
  reason. Administrator can read it.
- Export data backup (all stores, no auth secrets). Supabase point-in-time recovery on.
- Optimistic concurrency: every schedule mutation carries the week revision; stale writes are
  rejected with a "reload" message instead of overwriting someone else's change.

### 2.10 Explicitly not in v1
Time clock, geofence, punches, pay periods, payroll export, wages and labor cost, overtime law,
minors rules, drag-and-drop templates, coverage hard blocks on publish, Monday weeks, travel
buffers, email notifications, Vietnamese copy (decision F), AI scheduling, POS, training links.
Each is a phase-2 item that starts with Brian asking.

---

## 3. Decisions Brian must make (defaults so nothing blocks)

| # | Decision | Default we build unless Brian says otherwise | Why |
|---|---|---|---|
| A | How crew log in | Phone + SMS code for crew; email + password for managers/admins | Roster has no emails; phones are how a cafe crew lives |
| B | Which prototype branch is the baseline | 0.6.1 for access and everything except import; import rules from 2.8 | 0.6.1 has the manager fix Brian asked for; 0.6.0's import is more conservative in some places, less in others |
| C | Pickup: direct or manager-approved | Direct (U4 wording), with a per-store toggle to require approval | Brian's own words; toggle is cheap |
| D | Import blank cells and reset scope | Grid blank = off for included people; store-scoped Replace only; no all-store reset button | Excel sheet is the whole week; a company-wide wipe should never be one click |
| E | Week start | Sunday | Workbook, prototype, and 26 weeks of history are Sunday. Changing it regroups every budget and target |
| F | Bilingual (English/Vietnamese) staff screens | Not in v1; strings externalised so it can be added | Never requested; adds a translation review loop |
| G | Who is a manager at each store today, and are there two stores in the data already ("Thanh YB2") | Confirm on setup call | Data has one location placeholder (YB1); Yesler vs Mountlake Terrace mapping is unverified |
| H | Budgets and targets per store for the first live week | Brian enters them on go-live day; nothing invented | Prototype screenshots' numbers are illustrative |

Also needed from Yellow Bee before go-live: a roster with a phone or email per active person;
which store each person belongs to; Twilio account in Yellow Bee's name (EIN for 10DLC); the
domain to use (e.g. schedule.shopyellowbee.com).

---

## 4. Architecture

- **Next.js 16** App Router, React 19, TypeScript strict, Tailwind v4, lucide-react, zod,
  date-fns + date-fns-tz. Read `node_modules/next/dist/docs/` before writing routes.
- **Supabase**: Postgres, Auth (email + phone), RLS on every table, Realtime for the schedule
  grid and shift board, Storage for import files and backups, `pg_cron` for outbox dispatch
  and stale-offer cleanup.
- **Every mutation is a Postgres function** (`security definer`, all checks inside, one
  transaction). The client never writes tables directly. This is how the prototype's invariants
  (budget check against authoritative totals, cross-store overlap, one-winner pickup,
  outbox-with-transaction, revision check) stay atomic. RLS covers reads and defends the
  functions' inputs; the functions cover writes.
- **Actor comes from `auth.uid()`**, never from a posted ID. The location that authorises an
  action is the one the referenced week/shift/offer belongs to, not a posted `locationId`.
- **Service role key** only in the import parser route, the invite sender, the Twilio webhook,
  and cron jobs. Never in a browser bundle.
- **Twilio**: Verify for OTP login (through Supabase Auth); Messaging Service for team texts,
  called from an Edge/Route handler that reads the outbox; status webhook validates
  `X-Twilio-Signature` with the Twilio SDK against the exact public URL.
- **Vercel** for the app, custom domain, one preview per branch. Supabase project in us-west.
- Business timezone `America/Los_Angeles` on every location; times stored as `date` +
  `time` per shift (the domain is store-local wall-clock, exactly like the workbook), with a
  generated `starts_at timestamptz` for overlap checks.

---

## 5. Data model

Postgres. Names are final; columns are the minimum.

```
locations            id, code unique, name, address, timezone, status ('active'|'archived'),
                     first_week_start date, archived_at, created_at, updated_at
employees            id, legacy_id unique nullable, name, source_label, roster_status
                     ('active'|'historical'|'no_roster'), access_tier
                     ('administrator'|'manager'|'member'), user_id unique nullable -> auth.users,
                     exclude_adjusted bool, preferred_min_hours, preferred_max_hours, tags text[],
                     removed_at, created_at, updated_at, revision int
employee_contacts    employee_id pk, email, phone (E.164), sms_opt_in bool, sms_consent_at,
                     sms_consent_note, sms_consent_policy_version, phone_verified_at
                     -- separate table: RLS lets only admins and the person read it
employee_locations   employee_id, location_id, job_function ('Manager'|'Assistant Manager'|
                     'Shift Lead'|'Front Staff'|'Kitchen Staff'|'Grocery Staff'|'Unassigned'|
                     legacy text), manages bool, status ('active'|'removed'), added_by, added_at,
                     removed_by, removed_at, pk (employee_id, location_id)
invitations          id, employee_id, channel ('sms'|'email'), destination, token_hash,
                     expires_at, used_at, created_by, created_at
weeks                id, location_id, start_date (check: Sunday), source_sheet, status
                     ('draft'|'published'), published_at, published_by, budget_hours numeric null,
                     budget_source_week_id, budget_set_by, budget_set_at, targets jsonb
                     ({"0":{"07:30":2,...},...} null = not set), targets_source_week_id,
                     revision int, created_by, created_at, updated_at
                     unique (location_id, start_date)
shifts               id, week_id, location_id, employee_id, date, start_time, end_time,
                     break_minutes, notes, source, starts_at/ends_at timestamptz generated,
                     updated_by, updated_at
                     exclusion: no overlap per employee across all stores (on starts_at/ends_at)
publications         id, week_id, published_at, published_by, budget_hours_snapshot,
                     shift_count, gross_hours, revision
published_shifts     publication_id, shift_id, week_id, location_id, employee_id, date,
                     start_time, end_time, break_minutes, notes  -- immutable except pickup
budget_history       id, week_id, kind ('set'|'carried'|'removed'), old_hours, new_hours,
                     actor, at, source_week_id
budget_overrides     id, week_id, operation ('save_shift'|'create_week'|'copy_week'|'publish'|
                     'import'|'assign'), projected_hours, budget_hours, reason, actor, at, revision
availability         id, employee_id, kind ('recurring'|'date'), weekday int null, date null,
                     available bool, start_time, end_time, effective_from, effective_to, notes,
                     status ('published'|'pending_legacy'|'approved'|'declined'),
                     submitted_at, submitted_by, submitted_at_location, reviewed_by, review_note
preferences          employee_id pk, preferred_min_hours, preferred_max_hours, windows jsonb,
                     published_at
shift_releases       id, shift_id, week_id, location_id, offered_by, note, status
                     ('open'|'accepted'|'picked_up'|'withdrawn'|'closed'), created_at,
                     accepted_by, accepted_at, picked_up_by, resolved_by, resolved_at
shift_events         id, location_id, kind ('release'|'pickup'|'withdraw'|'assign'|'publish'|
                     'approve'|'decline'), release_id, week_id, message, actor, at
notification_outbox  id, event_id, employee_id, destination, body, status ('queued'|'submitted'|
                     'delivered'|'failed'|'skipped'|'cancelled'|'unknown'), skip_reason,
                     provider_message_id, attempts, created_at, submitted_at, final_at
                     unique (event_id, employee_id)
in_app_notifications id, employee_id, event_id, read_at, created_at
workbook_imports     id, actor, filename, sha256, bytes, storage_path, mode ('merge'|
                     'replace_location'), scope ('latest'|'all'), location_id, preview jsonb,
                     preview_expires_at, state_revision, backup_path, status ('previewed'|
                     'committed'|'discarded'|'expired'), committed_at
member_removals      id, employee_id, location_id null, actor, reason, at
settings             key pk, value jsonb   -- review_hours=40, coverage_times, sms_enabled,
                                          -- pickup_requires_approval per location
audit_log            id, actor, action, entity, entity_id, location_id, before jsonb, after jsonb,
                     reason, at   -- contacts redacted in before/after
```

**Helper functions (stable, security definer):**
`yb_me()` → employees row for `auth.uid()`; `yb_is_admin()`; `yb_manages(location_id)`;
`yb_member_of(location_id)`; `yb_active()`.

**RLS, per table (reads):**

| Table | Administrator | Manager | Member |
|---|---|---|---|
| locations | all | assigned stores | assigned stores |
| employees | all | active members of managed stores (name, function, status); own row | own row; name + function of members at shared stores via `employee_directory` view |
| employee_contacts | all | none except own | own |
| employee_locations | all | rows at managed stores; own | own |
| weeks | all | managed stores (all fields); assigned-only stores: published weeks, no budget/targets | published weeks at assigned stores, no budget/targets |
| shifts (draft) | all | managed stores | none |
| published_shifts | all | managed stores | own rows; plus rows referenced by an open `shift_releases` at assigned stores |
| budget_*, publications | all | managed stores | none |
| availability, preferences | all | published/approved rows of members at managed stores (no notes); own | own |
| shift_releases, shift_events | all | managed stores | assigned stores (no private notes) |
| notification_outbox | all | managed stores | own rows |
| workbook_imports, member_removals, audit_log | all | none | none |

Writes: none through RLS. Every write is one of the functions below.

**Mutation functions (each validates actor, scope, revision, and invariants):**
`save_location`, `archive_location`, `save_employee` (admin: everything; manager: job function
of member-tier at managed store only; self: contacts + preferences only), `set_access` (admin),
`remove_member`, `create_invitation`, `accept_invitation`, `create_week`, `copy_week`,
`save_shift`, `delete_shift`, `save_budget` (admin), `record_override`, `publish_week`,
`save_targets`, `publish_availability`, `review_legacy_availability`, `release_shift`,
`cancel_release`, `pickup_shift` (row lock on the release; one winner), `assign_release`,
`approve_pickup` / `decline_pickup` (only when the store toggle is on), `save_sms_preferences`,
`commit_import` (server route wraps it), `record_audit` (internal).

---

## 6. Screens and routes

```
/login                      email+password, phone OTP, magic link; /accept/[token]
/me                         My schedule (published, own, store switcher)        member+
/me/availability            Publish My Availability, preferences, history        member+
/me/board                   Shift Release & Available (offers at this store)     member+
/me/alerts                  Text alert settings + in-app notifications           member+
/store/[code]/schedule      Week grid, budget card, publish, print/CSV           manager (managed)
/store/[code]/coverage      Staffing coverage + Edit targets                     manager (managed)
/store/[code]/analytics                                                          manager (managed)
/store/[code]/team          Team members (job functions, remove member)          manager (managed)
/store/[code]/availability  Store availability view + legacy review              manager (managed)
/store/[code]/board         Board with release-on-behalf / assign                manager (managed)
/store/[code]/notifications Team notifications: enrollment + outbox history      manager (managed)
/admin/locations            Locations & access                                   admin
/admin/team                 All members, Add employee, Edit access, Invite       admin
/admin/import               Workbook import + history + Export data backup       admin
/admin/audit                                                                     admin
```

A manager who opens a store they do not manage sees the `/me/*` set with the notice from 0.6.1
and a link to their managed store. Phone layout: bottom nav for `/me/*`; two-column wrapped
menu for managers, matching the 0.6.1 mobile fix.

---

## 7. Migration of the real data

1. Import the **September workbook (26 sheets)** through the new importer, not `seed.json`, into a
   store the administrator has already renamed and mapped (decision G). Reconcile against the
   prototype's numbers before the new sheet: 25 weeks, 22 identities, 1,281 complete shifts,
   9,442.5 gross hours, latest-week 332.5 h; then the 0920-0926 sheet on top. Any mismatch stops
   go-live.
2. Known source issues carry over as flags, not guesses: the 0809-0815 F21 incomplete shift, the
   `#REF!` coverage formulas (recalculated from shifts), legacy availability notes kept as
   unverified text in the employee record, zero break minutes.
3. All imported weeks land as **draft**. Brian or the manager publishes the current and next week
   on go-live day, which sends the first (opt-in only) texts.
4. Historical people import as `historical`; the 12 active flags are a starting guess Brian
   confirms in Team members before anyone is invited.
5. If the bridge prototype was used, export its JSON backup and import that instead (it carries
   budgets, targets, availability, and memberships the workbook does not).

---

## 8. Build order

Each milestone ends on a pushed branch, a Vercel preview, and its tests green. Rough solo
effort in parentheses; parallel lead times noted.

**M0 — Decisions and setup (3–4 days).** Brian answers section 3. Supabase project, Vercel
project, repo `yellowbee-scheduling`, domain, Twilio account created in Yellow Bee's name and
10DLC registration submitted (runs in the background for 2–4 weeks). Copy this file to
`docs/BUILD-PLAN.md` in the new repo.

**M1 — Identity and access (1.5 weeks).** Migrations for locations, employees, contacts,
memberships, invitations, settings, audit, helpers, RLS. Auth: email+password, phone OTP, invite
send + accept, magic-link reset. Layout shells for `/me`, `/store`, `/admin`, store switcher,
manager default-store rule, not-managed notice. Admin: Locations & access, Team members
(Add/Edit access with the "workspace access after saving" panel), Invite, Remove member.
Tests: the whole 1.2 matrix as negative tests against local Supabase (each tier attempts each
forbidden read and each forbidden function); tier change visible in an open session; self-save
cannot touch privilege fields; removal blocked by future shifts.

**M2 — Schedule, budgets, targets, publish (2.5 weeks).** Weeks, shifts, publications,
budgets, overrides, targets. Grid UI, shift editor, new/copy week with inheritance, publish
dialog, dashboard cards, print/CSV, coverage page with red/amber/yellow. Realtime grid refresh.
Tests: every budget and target test name from the prototype (`v3:*`, `budget`, `v6 coverage`,
`v6 targets`); overlap incl. cross-store; revision conflicts; publish snapshot privacy.

**M3 — Availability (1 week).** Recurring/date/preferences, Publish My Availability, cross-store
application, published-week warnings, legacy review screen. Tests: `unapproved availability
never applies`, `publication does not cancel shifts`, `preferred windows cannot lie outside
availability`, effective dates.

**M4 — Release & pickup, notifications (2 weeks).** Releases, events, outbox, in-app feed,
consent screens, dispatcher (cron), Twilio send + status webhook, per-store approval toggle.
Tests: one-winner pickup under concurrency; owner stays assigned until commit; forged targets
ignored; outbox rows idempotent; disabled transport records reality; webhook signature
rejection; stale-offer cancellation. Then a real-device test with two consented staff phones.

**M5 — Analytics and import (2 weeks).** Analytics queries + charts + CSV. Import route
(bounded parser for the grid and table layouts, .xls via a maintained reader library, not a
hand-rolled BIFF parser), preview token, merge/replace commit, backup to Storage, history.
Tests: analytics reconcile to the workbook totals; repeat import idempotent; ambiguous names
fail atomically; stale preview rejected; malformed files leave state unchanged; contact columns
never change tier or consent.

**M6 — Migration, hardening, go-live (1.5 weeks).** Real import per section 7, roster confirmed,
managers set, budgets/targets entered, invitations sent, backup restore rehearsal, PWA manifest,
phone-layout pass, owner walkthrough at the store, first publish.

Total: roughly 10–11 weeks of build after M0, with Twilio registration in parallel. The bridge
(section 10) shortens the "nobody is using anything" window to about one week.

---

## 9. Acceptance: done means all of this passes

Ported from the prototype's suite and DECISIONS.md AC01–AC25, grouped. Written as Vitest
integration tests against a local Supabase plus Playwright for the golden flows.

**Accounts and access**
- Employee-linked Manager signs in, lands on a managed store, sees all 8 workspaces; on an
  assigned-but-unmanaged store sees member tools and the notice; server rejects the manager
  functions there.
- Member, Manager, and forged payloads cannot set tier, memberships, managed flags, budgets,
  stores, or invite; nothing partial is written.
- Admin changes a tier: the open session's next request reflects it; no re-invite.
- Removal from one store leaves the other working, revokes nothing else, keeps history; removal
  is blocked while future draft/published/offered shifts exist; self, admins, and peer managers
  cannot be removed by a manager.
- Standalone administrator with no roster record: everything admin works, nothing on the roster
  counts them, they receive no texts.
- Invitation: single-use, expiring, matches destination only, re-issue works, changed phone
  drops consent.
- Member queries (`select *` on every table, the REST API, Realtime) never return contacts,
  drafts, budgets, notes, other people's availability notes, or audit rows.

**Schedule**
- New week carries budget and targets from the closest earlier same-store week; zero vs unset
  preserved; old weeks untouched; other store's newer week ignored.
- Over-budget save/copy/publish/import/assign is rejected without a reason; accepted with one;
  cap unchanged; override not reusable after another change; reducing hours needs nothing.
- Overlap blocked across stores, adjacent allowed; non-Sunday week rejected; overnight rejected.
- Publish snapshots shifts + budget; later draft edits invisible to members; republish notifies
  only changed people with one summary each.
- Stale revision rejected, not overwritten.

**Coverage**
- Above target red, below amber, not-set pulses yellow with static label and reduced-motion
  behaviour; targets carry forward; not-set never becomes zero.

**Availability**
- Exact button text; effective immediately; applies across stores; never cancels a shift;
  published unavailable date blocks pickup and warns on publish; preferences don't guarantee.

**Release & pickup**
- Offered shift stays with owner and visible as theirs; two simultaneous claimants → one winner,
  one event, hours conserved, other store untouched; forged pickup target ignored; role
  mismatch, non-member, overlap, unavailability all block; withdraw retains assignment; started
  shifts cannot be offered; manager edit closes the offer; unrelated drafts not published.

**Notifications**
- Release and pickup notify the whole active opted-in store team; skipped recipients recorded;
  duplicate numbers get one row; disabled transport records "not sent"; "submitted" ≠
  "delivered"; unsent messages cancel when the offer is superseded; forged/replayed Twilio
  webhook rejected; restart converts interrupted submissions to unknown, never double-sends.

**Analytics and import**
- Totals reconcile to the workbook (25/22/1,281/9,442.5 before the new sheet); missing budgets
  excluded; published basis excludes drafts; role filter hides store budget comparison.
- Merge is idempotent; blank grid day removes that draft day; invalid day preserved and
  acknowledged; ambiguous name fails whole import; replace needs typed phrase and scope; stale or
  reused preview token rejected; oversized, encrypted, HTML-as-XLS, bad ZIP rejected with no
  state change; contact columns never touch tier/consent; imported weeks are drafts.

**Golden Playwright flows**
1. Admin adds a store, adds a manager with the workspace panel, invites by SMS; manager accepts
   on a phone, lands on Schedule; builds a week, hits the budget, overrides with a reason,
   publishes; a member gets the text and sees the week.
2. Member offers a shift; a second member picks it up; the first no longer sees it as theirs; the
   team gets both texts; the manager sees both events in Team notifications.
3. Admin imports the next week's workbook with Merge, reviews the preview, commits; the grid
   shows the new draft; a repeat import changes nothing.

---

## 10. Optional bridge: host prototype 0.6.1 this week

One day of work so real usage starts now:

1. $6–12/month VPS (Hetzner or DigitalOcean), Ubuntu, Node 22.16+, Caddy for HTTPS on
   `schedule.shopyellowbee.com`, systemd unit for `node server.cjs`, `YB_DATA_DIR` on a
   persistent path, nightly `sqlite3 .backup` to object storage, `NODE_ENV=production`,
   `SITE_ORIGIN` set. SMS stays disabled.
2. `node server.cjs --setup brian@…` for the administrator. Brian renames YB1, adds the second
   store, sets Emma's tier and managed store, adds phones/emails, invites by copying links.
3. Import the 0920-0926 sheet through the app's Workbook import (Merge, latest week).
4. Brian and Emma use it for 4–6 weeks. Their behaviour answers decisions C and D; their JSON
   export becomes the seed for the rebuild (section 7 step 5).

Not a substitute for the rebuild: single process, no automated invites, no password reset, no
phone login, no texts until 10DLC and consent are done, and code Apnosh should not extend.

---

## 11. What was not verified here

No prototype test suite was rerun; the 294/97 counts are the package's own captured results. No
hosted deployment, carrier delivery, or security audit exists for either the prototype or the
new build. Real store mapping, current roster, managers, budgets, and targets come from Brian.
