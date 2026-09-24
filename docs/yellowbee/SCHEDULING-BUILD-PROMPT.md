> **Superseded 2026-09-24.** The prototype handoff arrived and changed several assumptions in this
> draft (Sunday weeks, six fixed job functions, direct pickup with no manager approval, no time
> clock or payroll in v1). Build from `SCHEDULING-END-TO-END-BUILD.md`. This file is kept as the
> September 16 starting point.

# Yellowbee Scheduling — build prompt & context pack

**Purpose:** Paste this whole file as the opening message of a fresh Claude Code (or ChatGPT) session
to build the Yellowbee staff-scheduling product end to end. It carries everything a new session
needs that is not in the prototype itself: who the client is, what the product must do, the
stack, the data model, the file layout, the acceptance tests, and the questions still open.

**Sibling:** `TRAINING-BUILD-PROMPT.md`. The scheduling prototype and the training prototype were
built by two different people, independently, as tests. This file assumes nothing from the
training prototype. Build scheduling as its own product; section 12 covers how the two could
link later if the owner wants that.

**Builder:** Apnosh (Mark). The prototypers hand off; they do not keep building.

**Status:** Draft v1, 2026-09-16. Sections marked `[FILL]` need the ChatGPT prototype pasted in
before the build starts.

---

## 0. How to use this file

1. Get the handoff from the person who prototyped scheduling (section 2.0) and fill every
   `[FILL]` block. Do not build until section 2 is filled or explicitly marked "none yet".
2. Start the session with: *"You are building the Yellowbee scheduling app. Read this file top to
   bottom, then produce a plan that follows section 9 milestone by milestone. Do not skip the
   acceptance tests in section 10."*
3. Everything below the line is the prompt. Keep it in the new repo at `docs/BUILD-PROMPT.md` so
   later sessions start from the same place.

---

# THE PROMPT

## 1. Who this is for

**Client:** Yellowbee Market & Cafe (shopyellowbee.com, @shopyellowbee).
**What they are:** a hybrid Vietnamese market + cafe. Banh mi (including the signature bagel banh
mi), boba, full coffee bar, smoothies, groceries, grab-and-go.
**Locations:** 2.
- Yesler — 922 East Yesler Way, Seattle WA 98122. Primary. Hours Mon–Fri 7am–8pm, Sat–Sun 8am–8pm.
- Mountlake Terrace — hours not published; confirm with owner.

**Brand:** primary `#FDD427` (yellow), secondary `#2A6049` (green), accent white. Display font
Helvetica Bold, body Arial. Bold, flat, clean. Voice is quick, friendly, neighborhood deli — not
corporate. Copy in the app must read like a manager talking to their crew.

**Who uses it:**

| Role | What they do | Device |
|------|--------------|--------|
| Owner | Sets locations, roles, labor rules; publishes schedules; sees labor cost | Laptop + phone |
| Manager (per location) | Builds the weekly schedule, approves swaps and time-off, handles no-shows | Laptop + phone |
| Staff | Sees own shifts, sets availability, requests time off, swaps, clocks in/out | Phone only |

Staff are hourly, many part-time, some work both locations. Assume 15–40 staff total. Some staff
prefer Vietnamese; every staff-facing string must be translatable (English first, Vietnamese second).

**Relationship to Apnosh:** Apnosh is Yellowbee's marketing agency and is building this as a
separate custom product. It is **not** part of the Apnosh client portal (the portal's product spec
explicitly excludes staffing and scheduling). Build it as its own repo (`yellowbee-scheduling`)
and its own Supabase project. Reuse the Apnosh stack and conventions so the team can maintain it.

**Relationship to the training prototype:** none yet. A different person prototyped training
separately, with their own idea of staff, roles, and stations. Do not import their assumptions.
Where the two prototypes name the same thing differently (a "station" vs a "role"), this build
uses the terms in this file and the reconciliation happens in section 12, later, if at all.

## 2. What already exists (the ChatGPT prototype) `[FILL]`

One person prototyped and tested scheduling with ChatGPT before this build. They are not the
builder. Collect the following from them in one sitting so we are not starting from scratch. If
an item does not exist, write "none yet".

### 2.0 Handoff from the prototyper
`[FILL: name, role (owner / manager / staff / outside helper), dates they tested, which location
they tested at, who else saw it. Ask them the four questions: What did you try to solve? What
worked? What did the owner push back on? What did you never get to?]`

### 2.1 Screens the prototype had
`[FILL: list every screen, one line each: name, who sees it, what it shows. Paste screenshots into
/docs/prototype/screens/ and reference them here.]`

### 2.2 Data the prototype used
`[FILL: paste the roster (names can be replaced with placeholders), roles, the sample week
schedule, and any spreadsheet the owner currently uses. Put files in /docs/prototype/data/.]`

### 2.3 Rules the owner already agreed to
`[FILL: e.g. "minimum 2 on the floor at Yesler from 11–2", "no one under 18 closes", "boba station
must have a trained person every shift", "schedule publishes Thursday for the following Monday".]`

### 2.4 Things the owner rejected or disliked in the prototype
`[FILL: this is as valuable as what they liked. Every rejection here becomes a "do not build" line.]`

### 2.4b Things the prototyper assumed that the owner never confirmed
`[FILL: a prototype built by one person carries that person's guesses. List every rule, role
name, or workflow that came from the prototyper rather than the owner, so the build can confirm
each one in section 11 instead of inheriting it.]`

### 2.5 The prompts / conversation transcript
`[FILL: export the ChatGPT conversation to /docs/prototype/transcript.md. The build session reads
it once for intent, then treats THIS file as the source of truth where they disagree.]`

## 3. What the product must do (v1 scope)

Everything here ships in v1. Anything not here is v2 (section 11) and is not built without an
explicit ask.

### 3.1 Roster
- Staff records: name, preferred name, phone, email, preferred language, home location, roles they
  can work, hourly rate (owner/manager only), hire date, active flag.
- Roles are per location and owner-defined (e.g. Cashier, Banh mi line, Boba, Coffee, Market
  floor, Opener, Closer). Roles carry an optional free-text `requirement_note` ("must be
  boba-trained") that shows on the shift card. No hard gate in v1; see section 12.
- Invite flow: manager adds a phone number, staff gets an SMS link, signs in with a magic link or
  one-time code. No passwords for staff.

### 3.2 Availability & time off
- Weekly recurring availability per staff member (day × time window, per location if they work both).
- One-off unavailability and time-off requests with a reason; manager approves or declines with a
  note. Staff sees status.
- Availability changes take effect for schedules not yet published. Published weeks keep the old
  availability and show a warning to the manager.

### 3.3 Shift templates & the weekly schedule
- Shift template: location, role, start, end, break minutes, headcount needed, days of week. Owner
  edits templates; the manager generates a week from them in one click.
- Week view per location: rows are staff, columns are days; drag a shift to a person, click to edit.
  Also a "by role" view: rows are roles, showing coverage gaps in red.
- Coverage rules from section 2.3 evaluate live. A violation blocks publish unless the manager
  overrides with a reason (the override and reason are stored).
- Conflicts are hard blocks: overlapping shifts for one person, a shift outside availability, a
  shift at two locations with less than 60 minutes between them.
- Publish: sends each affected staff member a notification (SMS + in-app) with their shifts.
  Re-publishing a changed week notifies only the people whose shifts changed.

### 3.4 Swaps and open shifts
- Staff can offer a shift up for swap or ask to pick up an open shift. Another eligible staff
  member (right role, available, no conflict) accepts. Manager approves; only then does it move.
- Open shifts (headcount not met) are visible to eligible staff with a "claim" button.

### 3.5 Time clock
- Clock in/out from the phone. Geofence check against the location's coordinates (soft: records
  distance and flags, does not block). Manager can edit a punch with a reason.
- Timesheet per pay period per location: scheduled vs actual hours, overtime flag over 40h/week,
  export CSV in a format the owner's payroll accepts `[FILL: which payroll — Gusto, ADP, Square,
  spreadsheet?]`.

### 3.6 Labor cost view (owner only)
- Per week per location: scheduled hours × rate, actual hours × rate, the difference. Simple
  table plus one bar per day. No forecasting in v1.

### 3.7 Notifications
- Channels: SMS (Twilio) and in-app. Email optional, off by default.
- Events: schedule published, shift changed, swap request received / approved / declined, time-off
  decision, shift reminder 2 hours before start, no clock-in 15 minutes after start (to manager).
- Every message exists in English and Vietnamese. Staff pick their language once.

### 3.8 Admin (owner)
- Locations (name, address, lat/lng, timezone, hours), roles, coverage rules, pay periods,
  notification toggles, who is a manager where.

## 4. Non-goals for v1

No payroll processing, no tip pooling, no sales forecasting, no POS integration, no multi-company
support, no native app (installable PWA is the mobile story), no AI schedule generation. Rules
engine yes, AI no. If the owner asks for AI scheduling, log it in section 11.

## 5. Stack and conventions

Same as the Apnosh portal so the team can maintain both.

- **Next.js 16** App Router, React 19, TypeScript strict. Read `node_modules/next/dist/docs/` before
  writing route code; this version differs from training data.
- **Supabase** (Postgres + Auth + RLS + Storage + Realtime). Own project, not the Apnosh one.
- **Tailwind v4**, `lucide-react`, `clsx` + `tailwind-merge`.
- **zod** for every server-action input. **date-fns** + `date-fns-tz` for all time math. All
  timestamps stored `timestamptz` in UTC; every location carries an IANA timezone
  (`America/Los_Angeles` for both today, keep the column anyway).
- **Twilio** for SMS. **Resend** for optional email.
- **Vitest** for unit tests on the rules engine and time math. **Playwright** for the three golden
  flows in section 10.
- **Vercel** for hosting; one preview per branch.
- Package manager: npm. Node 24.

Conventions carried over from the Apnosh portal:
- Pages under 500 lines; extract components.
- Server actions in `src/lib/actions/*`, one file per domain, every input validated with zod.
- RLS on every table. No access checks duplicated in app code beyond what RLS enforces.
- Plain English copy, mobile-first, `lg:` breakpoint for the manager desktop layout.
- Every mutation that changes a schedule records who, when, and why (see section 6, `audit_log`).

## 6. Data model

One Supabase project. Table names are final; column lists are the minimum, add what the
prototype needs.

```
companies            id, name, created_at
locations            id, company_id, name, address, lat, lng, timezone, hours jsonb, is_active
profiles             id (auth.users), company_id, full_name, preferred_name, phone, email,
                     preferred_language ('en'|'vi'), role_level ('owner'|'manager'|'staff'),
                     home_location_id, hourly_rate_cents (RLS: owner/manager read only),
                     hire_date, is_active, created_at, updated_at
manager_locations    profile_id, location_id            -- which locations a manager runs
roles                id, location_id, name, color, requirement_note text (nullable), sort_order
staff_roles          profile_id, role_id                 -- who can work what
availability_rules   id, profile_id, location_id (nullable = any), weekday (0-6),
                     start_time, end_time, effective_from, effective_to
time_off_requests    id, profile_id, starts_at, ends_at, reason, status
                     ('pending'|'approved'|'declined'), decided_by, decided_at, decision_note
shift_templates      id, location_id, role_id, start_time, end_time, break_minutes,
                     headcount, weekdays int[], is_active
schedules            id, location_id, week_start date, status ('draft'|'published'),
                     published_at, published_by, version int
shifts               id, schedule_id, location_id, role_id, profile_id (nullable = open),
                     starts_at, ends_at, break_minutes, notes, source ('template'|'manual'|'swap')
coverage_rules       id, location_id, name, role_id (nullable), weekday int[] (nullable),
                     window_start, window_end, min_headcount, rule_type
                     ('min_headcount'|'no_minor_close'|'custom'), params jsonb
rule_overrides       id, schedule_id, coverage_rule_id, overridden_by, reason, created_at
swap_requests        id, shift_id, from_profile_id, to_profile_id (nullable = open offer),
                     status ('open'|'accepted'|'approved'|'declined'|'cancelled'),
                     accepted_by, approved_by, decided_at, note
time_punches         id, profile_id, shift_id (nullable), location_id, clock_in_at, clock_out_at,
                     in_lat, in_lng, in_distance_m, out_lat, out_lng, out_distance_m,
                     edited_by, edit_reason, source ('app'|'manager_edit')
pay_periods          id, company_id, starts_on, ends_on, status ('open'|'locked'|'exported')
notifications       id, profile_id, kind, payload jsonb, channel ('sms'|'in_app'|'email'),
                     sent_at, read_at, delivery_status
audit_log            id, actor_id, entity, entity_id, action, before jsonb, after jsonb,
                     reason, created_at
```

**RLS shape:**
- `staff` reads own profile, own shifts, own punches, own requests, published schedules for
  locations they belong to, and other staff's names + roles (for swaps). Never rates.
- `manager` reads/writes everything for locations in `manager_locations`.
- `owner` reads/writes everything in their company.
- Helper functions: `current_company_id()`, `is_owner()`, `manages_location(location_id)`.

**Invariants enforced in Postgres, not just the app:**
- A shift cannot overlap another shift for the same `profile_id` (exclusion constraint on
  `tstzrange(starts_at, ends_at)`).
- `schedules.week_start` is always a Monday.
- A punch's `clock_out_at` is null or after `clock_in_at`.

## 7. Repo layout

```
yellowbee-scheduling/
├── docs/
│   ├── BUILD-PROMPT.md              # this file
│   ├── prototype/                   # ChatGPT screens, data, transcript (section 2)
│   ├── DECISIONS.md                 # short ADR list, newest first
│   └── PAYROLL-EXPORT.md            # exact CSV columns the owner's payroll needs
├── supabase/
│   ├── migrations/
│   │   ├── 001_companies_locations_profiles.sql
│   │   ├── 002_roles_availability.sql
│   │   ├── 003_schedules_shifts_templates.sql
│   │   ├── 004_coverage_rules_overrides.sql
│   │   ├── 005_swaps.sql
│   │   ├── 006_time_clock_pay_periods.sql
│   │   ├── 007_notifications_audit.sql
│   │   └── 008_rls.sql
│   └── seed.sql                     # both locations, roles, 12 fake staff, one sample week
├── src/
│   ├── app/
│   │   ├── (auth)/login/            # magic link + OTP
│   │   ├── me/                      # STAFF, phone-first
│   │   │   ├── page.tsx             # my week
│   │   │   ├── availability/
│   │   │   ├── time-off/
│   │   │   ├── swaps/
│   │   │   └── clock/
│   │   ├── manage/[locationId]/     # MANAGER
│   │   │   ├── schedule/[weekStart]/
│   │   │   ├── requests/            # time off + swaps inbox
│   │   │   ├── timesheets/
│   │   │   └── staff/
│   │   ├── owner/                   # OWNER
│   │   │   ├── locations/
│   │   │   ├── roles/
│   │   │   ├── rules/
│   │   │   ├── labor/
│   │   │   └── settings/
│   │   └── api/
│   │       ├── cron/reminders/      # shift reminders + no-show checks (Vercel cron, every 5 min)
│   │       └── webhooks/twilio/     # inbound SMS replies (STOP, and "swap yes")
│   ├── components/
│   │   ├── schedule/                # WeekGrid, ShiftCard, CoverageBar, PublishDialog
│   │   ├── staff/                   # MyWeek, ShiftRow, ClockButton
│   │   └── ui/
│   ├── lib/
│   │   ├── supabase/                # client.ts, server.ts, admin.ts, middleware.ts (copy Apnosh)
│   │   ├── actions/                 # schedule.ts, shifts.ts, swaps.ts, timeoff.ts, clock.ts
│   │   ├── rules/                   # engine.ts + one file per rule_type; PURE, no IO
│   │   ├── time/                    # tz helpers, week math, overtime calc; PURE
│   │   ├── notify/                  # sms.ts, inapp.ts, templates/{en,vi}.ts
│   │   ├── i18n/                    # en.json, vi.json, t()
│   │   └── export/payroll-csv.ts
│   ├── types/database.ts            # generated: supabase gen types
│   └── middleware.ts
├── tests/
│   ├── unit/rules/*.test.ts
│   ├── unit/time/*.test.ts
│   └── e2e/*.spec.ts
└── .env.example
```

## 8. Environment variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=
TWILIO_WEBHOOK_SECRET=
RESEND_API_KEY=            # optional
CRON_SECRET=
NEXT_PUBLIC_APP_URL=
```

## 9. Build order (milestones)

Each milestone ends with a pushed branch, a Vercel preview link, and the listed tests green.

1. **Foundation** — repo, Supabase project, migrations 001–002 + 008, auth (magic link + OTP),
   `profiles` sync trigger, seed script, role-based layout shells for `/me`, `/manage`, `/owner`.
   Test: a seeded staff member can log in and sees an empty "my week".
2. **Roster & availability** — owner manages locations/roles, manager manages staff, staff sets
   availability and requests time off, manager decides. Test: availability rule round-trips;
   time-off decision notifies (in-app only at this point).
3. **Schedule builder** — templates, generate week, WeekGrid drag/drop, conflict hard blocks,
   rules engine with `min_headcount`, publish + version bump. Test: unit tests for every rule;
   e2e "build and publish a week".
4. **Staff week + SMS** — `/me` shows published shifts, Twilio wired, publish sends SMS, language
   switch works end to end. Test: publish a week, two staff get SMS in their language.
5. **Swaps & open shifts** — offer, accept, approve, notify. Test: e2e "swap a shift".
6. **Time clock & timesheets** — clock in/out with geofence flag, manager punch edits, pay
   periods, payroll CSV. Test: overtime calc unit tests; CSV snapshot test.
7. **Labor cost + cron** — owner labor view, shift reminders, no-show alert. Test: cron handler
   unit test with a fake clock.
8. **Hardening** — RLS test suite (each role tries every forbidden read), PWA manifest, Vietnamese
   copy review by a native speaker, load the real roster, owner walkthrough at Yesler.

## 10. Acceptance tests (must pass before "done")

Golden e2e flows (Playwright):
- **Build and publish a week:** manager generates from templates, fixes one coverage gap, tries
  to publish with a violation and is blocked, overrides with a reason, publishes; staff see it.
- **Swap a shift:** staff A offers, staff B accepts, manager approves, both notified, grid updated.
- **Clock a shift:** staff clocks in 200m away (flagged, not blocked), clocks out, timesheet shows
  actual vs scheduled, manager edits the punch with a reason, audit log has the edit.

Unit (Vitest):
- Every `rule_type` has a passing and a failing fixture.
- Overlap, two-location gap, outside-availability conflicts.
- Week math across a DST change (March and November) in `America/Los_Angeles`.
- Overtime over a week that spans two pay periods.

Security:
- A staff user cannot read any `hourly_rate_cents`, any other person's punches, or a draft
  schedule. Written as tests that run against a local Supabase.

## 11. Open questions for the owner (answer before milestone 3)

1. Which payroll system, and the exact export they need.
2. Mountlake Terrace hours and whether it shares staff with Yesler day to day.
3. Does the schedule publish weekly or bi-weekly, and on which day.
4. Minors on staff? If yes, closing and hours rules by WA law apply and become `coverage_rules`.
5. Is the geofence acceptable to staff, or should clock-in be from a shared tablet at the counter.
6. Who is a manager at each location today.
7. Which items from the ChatGPT prototype (section 2.4) are hard "no"s.
8. Each guess in section 2.4b: confirm, change, or drop.

## 12. v2 parking lot, and linking to training later

Sales-aware forecasting from POS, AI draft schedule from history, tip pooling, native push,
shift bidding.

**Linking to the training product.** If both products ship and the owner wants "nobody gets
scheduled on boba until they are boba-certified", the link is small and one-directional:
scheduling adds a `requires_cert` rule type that reads a `certifications` view exposed by the
training product (per person, per certification, granted and expiry), and the rules engine
blocks or warns. Nothing in this build should be designed around that link. Keep the two
products on separate repos and Supabase projects until the owner asks for the gate; a shared
login can come from Supabase auth on both sides using the same phone number as the identity.
