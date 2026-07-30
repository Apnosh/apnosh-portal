# The Questions — wording, answering, and design

**The goal (owner, 2026-07-30):** every question in the scratch-flow walk should be worded the
way an owner talks, answered through the most intuitive control for that kind of answer, and
designed so answering WELL is easier than answering badly. This lands before the pilot gate,
so the two test clients meet the best version of the walk.

**Why this matters more than any single screen:** the ledger work (Phases 1-3) fixed WHICH
questions get asked. This plan fixes HOW each one asks. A right question asked clumsily still
stalls a walk — and the pilot measures stalls.

---

## 1. The rules every question must pass

**Wording rules** (owner copy, enforced by a lint sim where possible):

- W1 · The title is something an owner would say across the counter. Max ~7 words.
- W2 · 5th-grade words. No marketing terms (no "audience", "reach", "assets", "campaign
  objective" in owner-facing copy — say "who walks in", "how far", "what you already have").
- W3 · The sub says what the answer CHANGES, in one or two sentences. Never "to help us serve
  you better."
- W4 · No em dashes in owner copy (standing rule, already sim-checked elsewhere).
- W5 · Optional questions say out loud what happens if skipped ("Skip it and we size the plan
  to the job").
- W6 · When the model read their paragraph, the why-line quotes THEIR words (whyAsk already
  does this — keep it first in priority).

**Answering rules** (the control taxonomy — every question uses exactly one):

- A1 · **Cards** for 2-5 choices where each choice has a consequence. Card = label + one-line
  consequence. Recommended option carries the badge and comes first.
- A2 · **Chips** for pick-many from a fixed vocabulary. Picked chips restate as a sentence
  under the grid ("No discounts. No faces on camera.") so the owner sees what they said.
- A3 · **A calendar** for dates. Never a bare text input. Days are colored by feasibility
  (from the same lead-time data the plan gate refuses on) so a good date is visibly good.
- A4 · **An anchored number** for numeric answers with a right zone: prefilled suggestion,
  the honest range said in words, and preset cards or a stepper so the common answers are
  one tap.
- A5 · **A madlib composer** for structured answers (the offer): pickers that assemble the
  sentence, with a live preview of the thing as a guest will see it. Structure prevents the
  vague answer.
- A6 · **Free text** only when the answer is genuinely theirs alone (notes, capacity detail).
  Always with a concrete example as the placeholder, never a blank void.

**Design rules** (the screen system):

- D1 · One decision per screen. If a screen holds two questions, the second is visually
  subordinate and marked optional.
- D2 · The consequence of the CURRENT answer is visible somewhere on screen at all times
  (the plan sheet inking at the bottom already does this — every control should also do it
  locally where it can).
- D3 · Thumb-first: Next/Back pinned to the bottom, tap targets 44px+, the primary option
  reachable without scrolling.
- D4 · Selection state is unmistakable: mint border + soft fill + the card's consequence line
  swaps in. Never color alone.
- D5 · Motion is one slide per screen change, disabled under reduced-motion. No decoration
  animation inside answers.

---

## 2. The per-question audit — current vs proposed

### Q-date · the date (dated shapes)
- **Now:** title "When do you open?" / "When is it?" (good), but the answer is a bare date
  input. Nothing tells the owner that a date three days out dooms the plan until the gate
  refuses it later.
- **Proposed control (A3):** a real calendar. Days are tinted by the same per-goal lead times
  plan-gates uses: gray = too soon (the gate would refuse), amber = tight (the gate would
  warn), plain = comfortable. The first comfortable day carries a small "earliest good day"
  tag. Picking a gray day is allowed but answers with the gate's warning inline, immediately,
  instead of at the end.
- **Wording:** keep the titles. Sub: "We work backwards from this day. Sooner than [date] is
  too tight to do it right."

### Q-start · the start (ongoing shapes)
- **Now:** two cards, ASAP recommended. This one is right. Keep.
- **Only change:** the "On a date" card opens the same calendar as Q-date (A3), not a bare
  input.

### Q-assets · what you bring
- **Now:** "What have you got to work with?" + 9-card grid. The payoff (you are never billed
  for what you have) lives in the sub where nobody reads, and "Nothing yet" is a dashed card
  competing for attention with real answers.
- **Proposed:** keep the grid (it works), but each card states its consequence WHEN SELECTED,
  from the data that already exists: covers → "This replaces the photo shoot. You will not
  pay for one." boosts → "This makes the event package stronger." That turns selection into
  visible money and strength, which is the reason to answer honestly.
- "Nothing yet" becomes a quiet text link under the grid ("I have nothing yet"), not a card.
- **Wording:** title stays. Sub: "Pick anything you already have. We build around it, and you
  are never billed for it."

### Q-promote · what to lead with
- **Now:** "What should we put in front of people?" + their menu + 12 more options in three
  groups. Biggest scan burden in the walk (up to ~22 options), and "Pick as many as fit"
  invites picking six things, which makes the content lead with nothing.
- **Proposed:** the menu leads, big and first. The three "other" groups collapse behind one
  "More to show" expander. Cap the ask: "Pick one to three. We lead with your first pick."
  The first pick visibly becomes the lead ("Leading with: Spicy Chicken Sandwich" restated
  under the grid, A2 style). Decide-for-me stays.
- **Wording:** title becomes "What should we lead with?" (their own words from onboarding's
  version of this question — shorter and warmer than "put in front of people").

### Q-reach · who and how far
- **Now:** one screen holds two questions (who walks in + how far to pull from), equal
  weight. Violates D1. And "The wider region / Anywhere" read abstract.
- **Proposed:** how far becomes a picture (A1 on a picture): four rings around "you" — the
  block, the neighbourhood, the whole city, worth a drive. Tap a ring. One glance answers
  "how far" better than four subtitled cards. Who-walks-in drops to a subordinate optional
  chip row below (D1): "Who is it mostly for? Optional. Sharpens the wording."
- **Wording:** title "How far should we pull people from?" Sub: "Ads and listings stop at
  this line. Wider costs more to reach the same person."

### Q-shift · which shifts
- **Now:** "Which shifts need filling?" with a muddled option set ('Monday to Wednesday',
  'Thursday', 'Sunday', 'Lunch', 'Late', 'Off-season') — day ranges and dayparts in one
  list. An owner with dead Friday lunches has no honest option.
- **Proposed:** a week strip (Mon-Sun, tap the slow days) + three daypart chips (Lunch,
  Dinner, After the rush) + the Off-season chip kept for seasonal businesses. Matches how
  owners actually say it ("Tuesday nights are dead"). The restated sentence under it: "Fixing:
  Tuesday and Wednesday dinner."
- **Wording:** title stays (it is good). Sub stays.

### Q-avoid · never do
- **Now:** 8 chips, optional. Solid. Two improvements only:
- The restated sentence (A2): picked chips echo as "Never: discounts, faces on camera." so
  the promise reads back as a promise.
- One short free line at the bottom: "Anything else we should never do?" (A6, one input, not
  a textarea) because the real deal-breakers are sometimes personal ("never mention the old
  owner").

### Q-offer · the deal (conditional)
- **Now:** three free-text inputs. Free text invites vague terms ("a discount"), and vague
  terms cannot be run, tracked, or capped.
- **Proposed (A5, the flagship redesign):** a deal composer. Three pickers assemble the
  sentence: [% off / $ off / a free item / two for one] + [amount] + [what it applies to:
  their real menu + "everything"]. Below, limit and end date as small optional fields (end
  date reuses the calendar). The whole time, a live coupon preview shows the deal as a guest
  will read it. You cannot compose a vague offer, which is the point. A "my deal is different"
  escape drops to one free-text line for the genuinely odd case.
- **Wording:** title "What is the deal, exactly?" stays. Sub: "This goes out exactly as you
  set it here. We never guess money."

### Q-capacity · if it works (conditional)
- **Now:** chips that append text into a textarea (tapping a chip edits the text — confusing),
  plus one big free box.
- **Proposed:** two clean parts. Part one, chips (pick any): Staffing is tight / Prep is the
  limit / Only so many of the featured item / Nothing limits us. Part two, one short input:
  "Who tells the staff about it?" with placeholder "The manager, at Friday setup." Free text
  note stays optional at the end. Stored as the same single string, composed FOR them.
- **Wording:** title "If this works, what limits you?" stays (it tests well as a real
  question). Sub tightens: "A full room needs the room ready. Tell us what runs out first."

### Q-target · the number (every campaign)
- **Now:** prefilled numeric input + metric label. Functional, but a raw number field asks
  the owner to have an opinion about a number they have never estimated.
- **Proposed (A4):** three preset cards + custom: "Careful" (0.7x), "Suggested" (1x, badged,
  preselected), "Ambitious" (1.5x), each showing its real number, plus a "my own number"
  input that opens on tap. The basis line stays ("typical for campaigns like this"). One tap
  confirms; typing is never required.
- **Wording:** title "What should this campaign hit?" stays. Sub stays (it already names the
  metric and the mid-run flag).

### Q-money · the budget (always last)
- **Now:** two cards (you size it / I have a number) + input + the honest range in words.
  Good since the redesign. One upgrade:
- **Proposed (A4):** when "I have a number" is open, add the slider on the existing STOPS
  under the input, with the honest range shaded on the track and a tick at the range middle.
  Slider and input stay in sync. The number keeps its confirm-tap rule when read from the
  paragraph.

### Q-notes · anything else
- **Now:** optional textarea with a good placeholder. Keep. Move nothing.

### The describe screen and the read-back chips
- Out of scope here (recently redesigned and verified). One small addition rides along: the
  example sentences under the sheet rotate to include one offer-shaped example, so owners
  learn the box understands deals.

---

## 3. The screen system (shared design spec)

Every question screen is the same plate, so the walk feels like one conversation:

```
[ say line — the voice acknowledging the last answer ]        13px, mute
[ N OF M ]                                                     11px caps, faint
[ Title ]                                                      21px display
[ Sub — what this changes ]                                    13px, mute, ≤2 lines
[ THE CONTROL ]                                                the whole middle
[ restated answer, when the control has one ]                  13px, ink
[ Back ]                                   [ Next / Build ]    pinned bottom, 50px
[ Your plan so far — the sheet, inking itself ]                sticky below
```

- Ground #F5F5F7, ink #1D1D1F, mint #4ABD98 as the only accent, hairline borders — the
  describe screen's tokens, everywhere.
- Cards: 15px radius, 1.5px border, mint + soft fill when on, consequence line swaps in on
  selection.
- Chips: 99px radius, same on-state. Chip grids wrap; max ~9 visible before an expander.
- The calendar: plain month grid, gray/amber/plain day tints, "earliest good day" tag. Tap
  to pick; picked day gets the mint fill.
- The coupon preview (offer): a small ticket-styled card, the deal sentence set large, limit
  and end date as fine print. It is the one decorated element in the walk, on purpose: it is
  the thing their guests will see.
- Progress: "N OF M" stays (honest, recomputes as reads shrink the list). No progress bar —
  a bar that jumps when M changes reads as broken.

---

## 4. Build plan (all before the pilot)

- **P1 · The copy table (small).** All titles/subs/restates move into one owner-copy module.
  A lint sim pins: no em dash, title ≤ 8 words, every optional question's sub contains its
  skip-consequence. Pure swap, no layout change.
- **P2 · Cheap control upgrades (1 session).** Assets consequence-on-select + "nothing yet"
  demotion; promote lead-with + collapse + cap-three; avoid restate + free line; capacity
  two-part; chips restate everywhere (A2).
- **P3 · The calendar (1 session).** One shared component; wired into Q-date, Q-start's
  "on a date", and the offer's end date. Feasibility tints from plan-gates lead times.
  Sim: tint thresholds equal gate thresholds (they can never disagree).
- **P4 · The deal composer + target presets (1 session).** The offer madlib + coupon
  preview + escape hatch; target's three preset cards. Sim: every composable deal produces
  parseable terms (redemption cap parses back out for suggestedTarget).
- **P5 · Reach rings + shift week strip + money slider (1 session).** The two visual
  controls + the slider. Browser pass on all 11 situations, phone width, reduced motion.

Each phase: tsc + full sim battery + a browser walk. The ledger sims already lock the
question LIST; these phases must not change it (the walk-law sim is the tripwire).

## 5. Decisions needed from the owner

1. **Reach + audience:** one screen with audience subordinate (proposed), or split into two
   screens (one more question in the count)?
2. **The offer composer:** structured pickers with a free-text escape (proposed), or keep
   free text with the preview only?
3. **The calendar's gray days:** pickable-with-warning (proposed), or hard-blocked below the
   gate's refuse line?
4. **Target presets:** Careful / Suggested / Ambitious at 0.7x / 1x / 1.5x — right feel, or
   fewer options (Suggested + custom only)?

Status: DRAFTED 2026-07-30. Awaiting owner review; builds after sign-off, before the pilot
gate opens to the test clients.
