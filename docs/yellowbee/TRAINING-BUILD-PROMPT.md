# Yellowbee Training — build prompt & context pack

**Purpose:** Paste this whole file as the opening message of a fresh Claude Code (or ChatGPT) session
to build the Yellowbee training videos / modules product end to end. It carries everything a new
session needs that is not in the prototype itself: who the client is, what the product must do,
the stack, the data model, the file layout, the acceptance tests, and the questions still open.

**Sibling:** `SCHEDULING-BUILD-PROMPT.md`. The training prototype and the scheduling prototype were
built by two different people, independently, as tests. This file assumes nothing from the
scheduling prototype. Training is its own product with its own repo, auth, and roster; section 12
covers how the two could link later if the owner wants that.

**Builder:** Apnosh (Mark). The prototypers hand off; they do not keep building.

**Status:** Draft v1, 2026-09-16. Sections marked `[FILL]` need the ChatGPT prototype pasted in
before the build starts.

---

## 0. How to use this file

1. Get the handoff from the person who prototyped training (section 2.0) and fill every `[FILL]`
   block (module outlines, video list, quiz questions, the owner's "what a new hire must know
   before touching the boba station" list).
2. Start the session with: *"You are building the Yellowbee training app. Read this file top to
   bottom, then produce a plan that follows section 9 milestone by milestone. Do not skip the
   acceptance tests in section 10."*
3. Keep this file at `docs/BUILD-PROMPT.md` in the new repo so later sessions start from the
   same place.

---

# THE PROMPT

## 1. Who this is for

**Client:** Yellowbee Market & Cafe (shopyellowbee.com, @shopyellowbee). Hybrid Vietnamese market +
cafe: banh mi (signature bagel banh mi with four bagel types and many proteins, including vegan),
boba and milk tea with toppings, full espresso program, smoothies, groceries, grab-and-go.
**Locations:** Yesler (922 East Yesler Way, Seattle WA 98122; primary) and Mountlake Terrace.

**Brand:** primary `#FDD427`, secondary `#2A6049`, accent white. Helvetica Bold display, Arial body.
Bold, flat, clean. Voice is quick, friendly, neighborhood deli. Training copy should sound like a
good shift lead showing you the ropes, not an HR portal.

**Why training exists:** high part-time turnover, several stations (cashier, banh mi line, boba,
coffee, market floor, open, close) each with its own procedures, food-safety obligations, and a
menu that keeps adding fusion items. The owner wants every new hire to reach "can run the boba
station alone" in a known number of days, and wants proof of who has completed what.

**Who uses it:**

| Role | What they do | Device |
|------|--------------|--------|
| Owner | Authors modules (or approves AI drafts), sets which stations require which modules, sees completion across both locations | Laptop |
| Manager | Assigns modules, signs off hands-on checks, sees who is blocked from a station | Laptop + phone |
| Trainee / staff | Watches videos, reads steps, passes quizzes, gets checked off, sees their own progress | Phone only |

Staff-facing content must exist in English and Vietnamese. Videos are recorded once; subtitles
carry the second language.

**Relationship to Apnosh:** Apnosh is Yellowbee's marketing agency, building this as a separate
custom product. It is **not** part of the Apnosh client portal. Build it as its own repo
(`yellowbee-training`) and its own Supabase project. Apnosh's content team will likely shoot the
videos, so the video brief format in section 3.6 should match how Apnosh already briefs a shoot
(location, shot list, talent, duration).

**Relationship to the scheduling prototype:** none yet. A different person prototyped scheduling
separately, with their own idea of staff and roles. Do not import their assumptions. This build
keeps its own roster (section 3.0). If the owner later wants training completion to gate
scheduling, section 12 describes the link; nothing here should be designed around it.

## 2. What already exists (the ChatGPT prototype) `[FILL]`

One person prototyped and tested training with ChatGPT before this build. They are not the
builder. Collect the following from them in one sitting. If an item does not exist, write
"none yet".

### 2.0 Handoff from the prototyper
`[FILL: name, role (owner / manager / staff / outside helper), dates they tested, which station
or module they tested with, who watched or took it. Ask them: What did you try to solve? What
worked? What did the owner push back on? What did you never get to?]`

### 2.1 Module outlines the prototype produced
`[FILL: paste every module outline: title, station/role, steps, estimated minutes. Put the raw
files in /docs/prototype/training/modules/.]`

### 2.2 Videos that already exist or were scripted
`[FILL: list each video: title, length, where the file is (Drive link), whether it has subtitles,
and whether the owner approved it. Scripts go in /docs/prototype/training/scripts/.]`

### 2.3 Quiz questions and hands-on checklists
`[FILL: paste them verbatim. Mark which the owner reviewed.]`

### 2.4 Rules the owner already agreed to
`[FILL: e.g. "nobody works boba solo until Boba 101 + a manager check-off", "food handler card
uploaded before first shift", "re-certify closing every 6 months".]`

### 2.5 What the owner rejected or disliked
`[FILL: each item becomes a do-not-build line.]`

### 2.5b Things the prototyper assumed that the owner never confirmed
`[FILL: station names, pass marks, "must re-certify every 6 months", who signs check-offs. List
every rule that came from the prototyper rather than the owner so section 11 can confirm each.]`

### 2.6 The ChatGPT transcript
`[FILL: export to /docs/prototype/training/transcript.md. Read once for intent; this file wins
where they disagree.]`

## 3. What the product must do (v1 scope)

### 3.0 Roster (this product's own)
- Staff records: name, preferred name, phone, email, preferred language, home location, hire
  date, active flag, `role_level` (owner / manager / staff). Managers are tied to locations.
- Stations are owner-defined per location (Cashier, Banh mi line, Boba, Coffee, Market floor,
  Opener, Closer). A station is what tracks target and what certifications unlock.
- Invite by phone number, SMS magic link or one-time code. No passwords for staff.
- The roster is a CSV import on day one (the owner's current list), editable in-app after.

### 3.1 Content model
- **Track** — an ordered set of modules for a role or a milestone (e.g. "New hire week 1",
  "Boba station", "Closer"). A track can require another track first.
- **Module** — one skill, 5–20 minutes. Ordered **lessons**, then an optional **quiz**, then an
  optional **hands-on check** a manager signs off in person.
- **Lesson** types: video (with subtitles), step list (numbered steps with an optional photo per
  step), reference card (one screen you can come back to: recipe ratios, the bagel banh mi build
  order, allergen chart), and document (PDF, e.g. the food-safety poster).
- **Quiz** — multiple choice or true/false, pass mark per quiz, retakes allowed, answers shuffled.
- **Hands-on check** — a checklist the manager ticks while watching the trainee do the thing.
  Signed with the manager's login on the trainee's phone or the manager's own.
- All content is **versioned**. Publishing a new version does not un-complete anyone; the owner
  can flag a version as "requires re-completion" and it does.

### 3.2 Assignment and gating
- Assignments come from three places: a station (everyone on station X gets track Y), a manager
  manually, or a due date rule (e.g. "within 7 days of hire date").
- A **certification** is what a completed track grants. It has an optional expiry
  (re-certify every N months). A station can require a certification; the manager grid shows who
  is cleared for which station. Enforcement inside a scheduling tool is out of scope here
  (section 12).
- Trainee sees: what is assigned, what is due when, what is blocking which station.

### 3.3 Progress and proof
- Per person: each lesson started/completed, quiz attempts and scores, check-off with who
  signed and when, certification granted/expired.
- Video completion means watched to 90% at 1x or slower; seeking to the end does not count.
- Manager dashboard per location: everyone × required tracks, red/yellow/green, expiring soon.
- Owner dashboard: both locations, completion rate per track, average days to certify, who
  signed the most check-offs (sanity check that sign-offs are real).
- Export: per person PDF "training record" for compliance, and a CSV of certifications.

### 3.4 Authoring
- Owner and managers author in-app. A module editor with drag-ordered lessons, a step editor,
  a quiz editor, and a check-off list editor. Autosave drafts.
- Upload video → transcode, thumbnail, and captions in English → machine-translated Vietnamese
  captions → owner or a Vietnamese-speaking staff member edits the translation in-app before
  publish. Untranslated content cannot publish if the module is marked bilingual-required.
- AI assist in the editor (Claude API): draft a step list from a video transcript, draft five
  quiz questions from a lesson, rewrite a step in the brand voice, translate a step. Every AI
  draft shows as a suggestion the author accepts, edits, or rejects, and the accept/edit/reject
  is recorded with the model and prompt version. AI never publishes anything.

### 3.5 Notifications
- Assigned, due in 3 days, overdue, quiz passed/failed, check-off requested (trainee → manager),
  certification granted, certification expiring in 30 days. SMS + in-app, English/Vietnamese,
  same notify layer as scheduling.

### 3.6 Video production brief
- Each video lesson carries a brief: location, station, shot list, talent, target length,
  what must be visible (hands, ratios, labels), status (`planned` → `shot` → `edited` →
  `approved` → `published`). Apnosh's shoot team works from this list. An export of all
  `planned` briefs becomes the shoot plan.

## 4. Non-goals for v1

No SCORM/LMS interoperability, no live classes, no cohort scheduling, no gamification beyond a
progress bar, no public course marketplace, no AI-generated video, no AI grading of free-text
answers. Content lives in this app, not YouTube.

## 5. Stack and conventions

Same as the Apnosh portal so the team can maintain it: **Next.js 16** App Router (read
`node_modules/next/dist/docs/` first; this version differs from training data), React 19,
TypeScript strict, **Supabase** (own project), Tailwind v4, lucide-react, clsx + tailwind-merge,
**zod** on every server-action input, date-fns, **Twilio** for SMS, Vitest, Playwright, Vercel,
npm, Node 24. Specific to this product:

- **Video:** Mux (upload, transcode, thumbnails, signed playback, `mux-player-react`). Mux
  gives watched-percentage events, which is how 90% completion is measured. Fallback if the
  owner declines the cost: Supabase Storage + HLS via `ffmpeg` in a build step, and a
  `timeupdate` tracker in the player.
- **Captions:** Mux auto-captions for English; **Claude API** for the Vietnamese pass with a
  human edit before publish.
- **PDF export:** `@react-pdf/renderer` for the training record.
- **AI:** `@anthropic-ai/sdk`, one helper `src/lib/ai/assist.ts`, prompts in
  `src/lib/ai/prompts/*.ts` with a `PROMPT_VERSION` constant per file. Every call logs to
  `ai_generations` (section 6). If the API key is missing or the call fails, the editor shows
  "AI assist unavailable" and everything else still works.

Conventions carried over from the Apnosh portal:
- Pages under 500 lines; extract components.
- Server actions in `src/lib/actions/*` with zod inputs.
- RLS on every table.
- Plain English copy, mobile-first for `/me/*`.
- Provenance on every artifact: who created it, how (human / AI-draft-accepted / AI-draft-edited),
  from what input. Outcomes attached after the fact (quiz pass rates per question feed back to
  the author as "this question fails 60% of the time").

## 6. Data model

Own Supabase project. Column lists are the minimum, add what the prototype needs.

```
companies            id, name, created_at
locations            id, company_id, name, address, timezone, is_active
profiles             id (auth.users), company_id, full_name, preferred_name, phone, email,
                     preferred_language ('en'|'vi'), role_level ('owner'|'manager'|'staff'),
                     home_location_id, hire_date, is_active, can_author bool, created_at, updated_at
manager_locations    profile_id, location_id
stations             id, location_id, name, color, requires_certification_id (nullable), sort_order
staff_stations       profile_id, station_id
notifications        id, profile_id, kind, payload jsonb, channel ('sms'|'in_app'), sent_at,
                     read_at, delivery_status
audit_log            id, actor_id, entity, entity_id, action, before jsonb, after jsonb, reason,
                     created_at

tracks               id, company_id, title, description, target_station_ids uuid[], prerequisite_track_id,
                     grants_certification_id, due_days_after_hire int, status ('draft'|'published'|
                     'archived'), sort_order, created_by, created_at, updated_at
track_modules        track_id, module_id, sort_order
modules              id, company_id, title, summary, station text, estimated_minutes,
                     bilingual_required bool, current_version_id, status, created_by
module_versions      id, module_id, version int, published_at, published_by,
                     requires_recompletion bool, change_note
lessons              id, module_version_id, kind ('video'|'steps'|'reference'|'document'),
                     title, sort_order, body jsonb (steps[], card fields, or doc ref),
                     video_id (nullable), provenance jsonb {source:'human'|'ai_accepted'|'ai_edited',
                     generation_id}
lesson_translations  lesson_id, lang ('en'|'vi'), title, body jsonb, status ('machine'|'reviewed'),
                     reviewed_by, reviewed_at
videos               id, company_id, provider ('mux'|'storage'), provider_asset_id,
                     playback_id, duration_s, thumbnail_url, status ('uploading'|'ready'|'error'),
                     captions_en_status, captions_vi_status, brief jsonb, brief_status
                     ('planned'|'shot'|'edited'|'approved'|'published')
quizzes              id, module_version_id, pass_mark_pct, max_attempts (nullable), shuffle bool
quiz_questions       id, quiz_id, sort_order, kind ('mc'|'tf'), prompt, choices jsonb,
                     correct_index int, explanation, provenance jsonb
quiz_question_translations  question_id, lang, prompt, choices jsonb, explanation, status
checklists           id, module_version_id, title
checklist_items      id, checklist_id, sort_order, text, critical bool
certifications       id, company_id, name, expires_after_months (nullable)
assignments          id, profile_id, track_id, source ('role'|'manual'|'hire_rule'),
                     assigned_by, assigned_at, due_at, status ('assigned'|'in_progress'|
                     'complete'|'overdue'|'waived'), waived_reason
lesson_progress      profile_id, lesson_id, module_version_id, started_at, completed_at,
                     watched_pct numeric, last_position_s
quiz_attempts        id, profile_id, quiz_id, module_version_id, started_at, submitted_at,
                     score_pct, passed bool, answers jsonb
checkoffs            id, profile_id, checklist_id, module_version_id, signed_by, signed_at,
                     items jsonb (item_id → passed bool), notes, location_id
module_completions   profile_id, module_id, module_version_id, completed_at
staff_certifications id, profile_id, certification_id, granted_at, expires_at, granted_via_track_id,
                     revoked_at, revoked_reason
ai_generations       id, actor_id, purpose ('steps_from_transcript'|'quiz_from_lesson'|
                     'rewrite_voice'|'translate'), model, prompt_version, input jsonb,
                     output jsonb, outcome ('accepted'|'edited'|'rejected'|null),
                     final_output jsonb, created_at
question_stats       question_id, attempts int, correct int      -- materialized nightly
```

**RLS shape:**
- `staff` reads published tracks/modules/lessons assigned to them, own progress, own attempts,
  own check-offs, own certifications. Cannot read `correct_index` (serve quizzes through a
  server action that strips it; grade server-side).
- `manager` reads/writes progress, check-offs, and assignments for their locations; reads all
  published content; writes drafts if the owner grants `can_author`.
- `owner` everything.

**Invariants in Postgres:**
- One `lesson_progress` row per (profile, lesson, module_version).
- `checkoffs.signed_by` must be a manager or owner (trigger check).
- A `staff_certifications` row is inserted only by the completion function
  `grant_certification_if_track_complete(profile_id, track_id)`; the app never inserts directly.

## 7. Repo layout

```
yellowbee-training/
├── docs/
│   ├── BUILD-PROMPT.md              # this file
│   ├── prototype/                   # modules, scripts, quizzes, transcript (section 2)
│   ├── DECISIONS.md                 # short ADR list, newest first
│   └── VIDEO-BRIEF-FORMAT.md        # the shoot brief fields, shared with Apnosh's shoot team
├── supabase/
│   ├── migrations/
│   │   ├── 001_companies_locations_profiles.sql
│   │   ├── 002_stations_notifications_audit.sql
│   │   ├── 003_training_content.sql     # tracks, modules, versions, lessons, translations, videos
│   │   ├── 004_quizzes_checklists.sql
│   │   ├── 005_assignments_progress.sql
│   │   ├── 006_certifications.sql       # + grant function
│   │   ├── 007_ai_generations.sql
│   │   └── 008_rls.sql
│   └── seed.sql                     # both locations, stations, 12 fake staff, one real track
├── src/
│   ├── app/
│   │   ├── (auth)/login/                   # magic link + OTP
│   │   ├── me/training/                    # STAFF
│   │   │   ├── page.tsx                    # my tracks, due dates, what's blocking me
│   │   │   ├── [trackId]/page.tsx
│   │   │   └── module/[moduleId]/
│   │   │       ├── page.tsx                # lesson player, step viewer, reference card
│   │   │       ├── quiz/page.tsx
│   │   │       └── checkoff/page.tsx       # "hand your phone to a manager"
│   │   ├── manage/[locationId]/training/   # MANAGER
│   │   │   ├── page.tsx                    # people × tracks grid
│   │   │   ├── assign/
│   │   │   └── checkoffs/                  # pending check-off requests
│   │   ├── owner/training/                 # OWNER
│   │   │   ├── page.tsx                    # both locations, completion, expiring
│   │   │   ├── locations/ stations/ staff/ # roster admin
│   │   │   ├── tracks/
│   │   │   ├── modules/[moduleId]/edit/    # module editor
│   │   │   ├── videos/                     # library + briefs + shoot plan export
│   │   │   ├── certifications/
│   │   │   └── translations/               # review queue for machine translations
│   │   └── api/
│   │       ├── webhooks/mux/               # asset ready, captions ready, view events
│   │       ├── cron/training/              # due/overdue/expiring notifications, question_stats
│   │       └── export/training-record/[profileId]/
│   ├── components/training/
│   │   ├── player/                         # VideoLesson, StepsLesson, ReferenceCard, DocLesson
│   │   ├── quiz/                           # QuizRunner, QuestionCard, Result
│   │   ├── checkoff/                       # ChecklistSigner
│   │   ├── editor/                         # ModuleEditor, LessonEditor, StepEditor, QuizEditor,
│   │   │                                   # ChecklistEditor, AiSuggestion, TranslationEditor
│   │   └── dashboards/                     # ProgressGrid, ExpiringList, TrackStats
│   ├── lib/
│   │   ├── supabase/                       # client.ts, server.ts, admin.ts, middleware.ts (copy Apnosh)
│   │   ├── notify/ + i18n/                 # sms.ts, inapp.ts, templates/{en,vi}.ts, en.json, vi.json
│   │   ├── actions/training/               # content.ts, assign.ts, progress.ts, quiz.ts,
│   │   │                                   # checkoff.ts, certify.ts, video.ts, translate.ts
│   │   ├── training/
│   │   │   ├── completion.ts               # PURE: is module/track complete given progress rows
│   │   │   ├── gating.ts                   # PURE: what blocks a person from a role
│   │   │   └── grading.ts                  # PURE: score a quiz submission
│   │   ├── video/mux.ts
│   │   ├── ai/assist.ts + prompts/         # steps_from_transcript, quiz_from_lesson, rewrite, translate
│   │   └── export/training-record-pdf.tsx
│   ├── types/database.ts                   # generated: supabase gen types
│   └── middleware.ts
├── .env.example
└── tests/
    ├── unit/training/*.test.ts
    └── e2e/training-*.spec.ts
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
CRON_SECRET=
NEXT_PUBLIC_APP_URL=
MUX_TOKEN_ID=
MUX_TOKEN_SECRET=
MUX_WEBHOOK_SECRET=
MUX_SIGNING_KEY_ID=
MUX_SIGNING_KEY_PRIVATE=
ANTHROPIC_API_KEY=
```

## 9. Build order (milestones)

Each milestone ends with a pushed branch, a Vercel preview link, and the listed tests green.

1. **Foundation** — repo, Supabase project, migrations 001–002 + 008, auth (magic link + OTP),
   `profiles` sync trigger, roster CSV import, stations admin, layout shells for `/me`, `/manage`,
   `/owner`. Test: a seeded staff member logs in and sees an empty "my training".
1b. **Content schema + seed** — migrations 003–004, seed one real track from the prototype
   ("Boba station": 3 modules, 1 video placeholder, 1 quiz, 1 checklist). Test: RLS suite for
   staff cannot read `correct_index`.
2. **Trainee player** — `/me/training`, steps and reference lessons, quiz runner with server-side
   grading, progress rows. Test: unit `grading.ts`; e2e "complete a steps module and pass the quiz".
3. **Video** — Mux upload from the owner library, webhook → `videos.status`, signed playback,
   90% completion tracking, English captions. Test: webhook handler unit test; completion rule
   unit test (seek-to-end does not complete).
4. **Assignments, check-offs, certifications** — station-based and manual assignment, hire-date
   rule, manager check-off signing, `grant_certification_if_track_complete`, expiry, "cleared
   for station" view on the manager grid. Test: e2e "manager signs a check-off and the trainee
   shows as cleared for Boba".
5. **Authoring** — module editor, lesson/quiz/checklist editors, versioning with
   `requires_recompletion`, video briefs and shoot-plan export. Test: e2e "publish v2 of a
   module and see who must redo it".
6. **Bilingual** — translation tables, machine translation via Claude, review queue, publish gate
   for `bilingual_required`. Test: cannot publish a bilingual-required module with an
   unreviewed Vietnamese lesson.
7. **AI assist** — the four editor assists with `ai_generations` logging and the accept/edit/reject
   capture. Degraded mode when the key is missing. Test: assist call logs a row; missing key
   shows the unavailable state and the editor still saves.
8. **Dashboards, notifications, exports** — manager grid, owner overview, cron for due/overdue/
   expiring, question stats, training-record PDF, certification CSV. Test: cron unit tests with a
   fake clock; PDF snapshot.
9. **Hardening** — Vietnamese copy review by a native speaker, load real modules from section 2,
   shoot the first three videos with Apnosh, owner walkthrough with one real new hire.

## 10. Acceptance tests (must pass before "done")

Golden e2e flows (Playwright):
- **New hire, day one:** hire-date rule assigns "New hire week 1"; trainee opens it on a phone,
  finishes a steps lesson, watches a video to 90%, passes the quiz on the second attempt,
  requests a check-off; manager signs it; certification granted; owner dashboard turns green.
- **Re-certification:** owner publishes module v2 with `requires_recompletion`; everyone
  certified via that module shows as "redo required"; a trainee redoes it and is re-certified.
- **Cleared-for-station is right:** the manager grid shows a person as not cleared for Boba until
  the track completes, and drops them back to not cleared the day the certification expires.

Unit (Vitest):
- `completion.ts`: module complete requires every lesson complete, quiz passed if present,
  check-off signed if present.
- `grading.ts`: shuffle does not change scoring; pass mark boundary.
- Video completion: 89.9% is incomplete, 90% at 1x is complete, a seek from 10% to 100% is
  incomplete.
- Expiry math over month boundaries.

Security:
- Staff cannot read `correct_index`, other people's attempts, or draft modules.
- A staff login cannot insert into `checkoffs` or `staff_certifications`.

## 11. Open questions for the owner (answer before milestone 3)

1. Mux at roughly $[FILL] per month, or self-host video and accept rougher playback.
2. Who reviews Vietnamese translations. If nobody on staff, Apnosh hires a reviewer per batch.
3. The first five modules to ship, in order. Suggested: New hire week 1, Food safety basics,
   Cashier, Bagel banh mi build, Boba station.
4. Should certification gates block scheduling from day one, or start as warnings for a month.
5. Food-handler card: upload and expiry tracking in this app (adds a `documents` table), or
   handled elsewhere.
6. Which prototype items (section 2.5) are hard "no"s.
7. Each guess in section 2.5b: confirm, change, or drop.
8. Whether the roster should be shared with the scheduling product from day one (only if both
   ship together; otherwise keep them separate and revisit).

## 12. v2 parking lot, and linking to scheduling later

Free-text quiz answers with AI grading and manager review, per-station skill levels
(trainee / solo / trainer), trainer assignment and trainer scoring, cohort onboarding sessions,
POS-driven prompts ("boba attach rate dropped, refresh the upsell lesson"), a client-facing
summary of training completion inside the Apnosh portal proof cards.

**Linking to the scheduling product.** If both ship and the owner wants an uncertified person
blocked from a station on the schedule, this product exposes one read-only view,
`certification_status(profile_phone, certification_name, granted_at, expires_at)`, behind a
service key, and the scheduling product's rules engine reads it. Identity joins on phone number.
No shared tables, no shared repo, until the owner asks for the gate and both rosters have been
reconciled by hand once.
