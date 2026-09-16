# Yellowbee Training — build prompt & context pack

**Purpose:** Paste this whole file as the opening message of a fresh Claude Code (or ChatGPT) session
to build the Yellowbee training videos / modules product end to end. It carries everything a new
session needs that is not in the prototype itself: who the client is, what the product must do,
the stack, the data model, the file layout, the acceptance tests, and the questions still open.

**Pairs with:** `SCHEDULING-BUILD-PROMPT.md`. Training lives in the same repo and Supabase project
as scheduling and reads the same `profiles`, `locations`, and `roles` tables. Build scheduling's
milestone 1 (auth + roster) first; training starts from there.

**Status:** Draft v1, 2026-09-16. Sections marked `[FILL]` need the ChatGPT prototype pasted in
before the build starts.

---

## 0. How to use this file

1. Fill every `[FILL]` block from the ChatGPT prototype (module outlines, video list, quiz
   questions, the owner's "what a new hire must know before touching the boba station" list).
2. Start the session with: *"You are building the Yellowbee training module inside the
   yellowbee-ops repo. Read this file top to bottom, then produce a plan that follows section 9
   milestone by milestone. Do not skip the acceptance tests in section 10."*
3. Keep this file at `docs/TRAINING-BUILD-PROMPT.md` in the project so later sessions start from
   the same place.

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
| Owner | Authors modules (or approves AI drafts), sets which roles require which modules, sees completion across both locations | Laptop |
| Manager | Assigns modules, signs off hands-on checks, sees who is blocked from a station | Laptop + phone |
| Trainee / staff | Watches videos, reads steps, passes quizzes, gets checked off, sees their own progress | Phone only |

Staff-facing content must exist in English and Vietnamese. Videos are recorded once; subtitles
carry the second language.

**Relationship to Apnosh:** Apnosh is Yellowbee's marketing agency, building this as a separate
custom product. It is **not** part of the Apnosh client portal. Apnosh's content team will
likely shoot the videos, so the video brief format in section 3.6 should match how Apnosh already
briefs a shoot (location, shot list, talent, duration).

## 2. What already exists (the ChatGPT prototype) `[FILL]`

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

### 2.6 The ChatGPT transcript
`[FILL: export to /docs/prototype/training/transcript.md. Read once for intent; this file wins
where they disagree.]`

## 3. What the product must do (v1 scope)

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
- Assignments come from three places: a role (everyone with role X gets track Y), a manager
  manually, or a due date rule (e.g. "within 7 days of hire date").
- A **certification** is what a completed track grants. It has an optional expiry
  (re-certify every N months). The scheduling module's `roles.requires_certification_id`
  points here, so an uncertified person cannot be scheduled on that role once the owner turns
  the gate on.
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

Identical to scheduling (Next.js 16 App Router, React 19, TypeScript strict, Supabase, Tailwind
v4, lucide-react, zod, date-fns, Vitest, Playwright, Vercel, Node 24). Additions for this
module:

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

Same Supabase project as scheduling. Reuses `companies`, `locations`, `profiles`, `roles`,
`notifications`, `audit_log`.

```
tracks               id, company_id, title, description, target_role_ids uuid[], prerequisite_track_id,
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

## 7. Repo layout (additions to `yellowbee-ops`)

```
yellowbee-ops/
├── docs/
│   ├── TRAINING-BUILD-PROMPT.md     # this file
│   ├── prototype/training/          # modules, scripts, quizzes, transcript (section 2)
│   └── VIDEO-BRIEF-FORMAT.md        # the shoot brief fields, shared with Apnosh's shoot team
├── supabase/migrations/
│   ├── 020_training_content.sql     # tracks, modules, versions, lessons, translations, videos
│   ├── 021_training_quizzes_checklists.sql
│   ├── 022_training_assignments_progress.sql
│   ├── 023_training_certifications.sql   # + grant function + link to roles.requires_certification_id
│   ├── 024_ai_generations.sql
│   └── 025_training_rls.sql
├── src/
│   ├── app/
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
│   │   ├── actions/training/               # content.ts, assign.ts, progress.ts, quiz.ts,
│   │   │                                   # checkoff.ts, certify.ts, video.ts, translate.ts
│   │   ├── training/
│   │   │   ├── completion.ts               # PURE: is module/track complete given progress rows
│   │   │   ├── gating.ts                   # PURE: what blocks a person from a role
│   │   │   └── grading.ts                  # PURE: score a quiz submission
│   │   ├── video/mux.ts
│   │   ├── ai/assist.ts + prompts/         # steps_from_transcript, quiz_from_lesson, rewrite, translate
│   │   └── export/training-record-pdf.tsx
│   └── types/database.ts                   # regenerated
└── tests/
    ├── unit/training/*.test.ts
    └── e2e/training-*.spec.ts
```

## 8. Environment variables (additions)

```
MUX_TOKEN_ID=
MUX_TOKEN_SECRET=
MUX_WEBHOOK_SECRET=
MUX_SIGNING_KEY_ID=
MUX_SIGNING_KEY_PRIVATE=
ANTHROPIC_API_KEY=
```

## 9. Build order (milestones)

Each milestone ends with a pushed branch, a Vercel preview link, and the listed tests green.

1. **Content schema + seed** — migrations 020–021 + 025, seed one real track from the prototype
   ("Boba station": 3 modules, 1 video placeholder, 1 quiz, 1 checklist). Test: RLS suite for
   staff cannot read `correct_index`.
2. **Trainee player** — `/me/training`, steps and reference lessons, quiz runner with server-side
   grading, progress rows. Test: unit `grading.ts`; e2e "complete a steps module and pass the quiz".
3. **Video** — Mux upload from the owner library, webhook → `videos.status`, signed playback,
   90% completion tracking, English captions. Test: webhook handler unit test; completion rule
   unit test (seek-to-end does not complete).
4. **Assignments, check-offs, certifications** — role-based and manual assignment, hire-date
   rule, manager check-off signing, `grant_certification_if_track_complete`, expiry. Wire
   `roles.requires_certification_id` into the scheduling rules engine as a `requires_cert`
   rule. Test: e2e "manager signs a check-off and the trainee becomes schedulable on Boba".
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
- **Gate holds:** manager tries to schedule an uncertified person on the Boba role; scheduling
  blocks with the reason "needs Boba station certification".

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

## 12. v2 parking lot

Free-text quiz answers with AI grading and manager review, per-station skill levels
(trainee / solo / trainer), trainer assignment and trainer scoring, cohort onboarding sessions,
POS-driven prompts ("boba attach rate dropped, refresh the upsell lesson"), a client-facing
summary of training completion inside the Apnosh portal proof cards.
