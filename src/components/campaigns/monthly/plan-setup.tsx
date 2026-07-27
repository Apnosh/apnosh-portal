'use client'

/**
 * Before we build it — five questions, each with the control its question deserves.
 *
 * DESIGN RULES THIS FILE IS HELD TO:
 *   1. No free text in any question. One notes box at the end, labelled for what it is.
 *   2. Every question offers "Decide for me", and picking it SHOWS what it decided and where that
 *      came from. An owner who does not know the answer should never be blocked, but they should
 *      also never be handed a black box.
 *   3. No control whose output nothing consumes. Reach earns its place because it genuinely drops
 *      address-bound services; the budget ceiling is a real computed figure, not decoration.
 *
 * ON THE BUDGET CEILING. There is no cap on what someone may spend, but there IS a point past which
 * the catalog has nothing left to sell them — a lot of it is held on rails that do not exist yet. An
 * owner sliding a budget should be told that while they slide, not discover it on the invoice. So
 * the slider runs to $10,000+ and the line underneath goes honest at the top.
 */

import { useMemo, useState } from 'react'
import { ArrowRight, MessageSquare, Link2, Check, Users, Star, Moon, TrendingUp, Wand2, Ban, Store, Megaphone, Clock } from 'lucide-react'
import { C, DISPLAY, AMBER_DK, AMBER_SOFT } from '@/components/mvp/mvp-detail'
import { connectRecommendations, isKnown, type PlanInputs } from '@/lib/campaigns/data/plan-inputs'
import {
  PLAN_GOALS,
  SITUATIONS,
  OWNER_ASSETS,
  goalReadiness,
  matchSituation,
  situationByValue,
  gapsFor,
  assetsCover,
  type PlanGoalKey,
  type PlanQuestion,
  type CampaignShape,
} from '@/lib/campaigns/data/plan-goals'
import { excludedByReach, type Reach } from '@/lib/campaigns/data/monthly-plan'
import type { GoalKey } from '@/lib/campaigns/types'

export interface Answers {
  /** A date, a run, or ongoing. Asked FIRST, because it decides which goals even make sense. */
  shape?: CampaignShape
  /** The day it happens (shape 'date'), or the start (shape 'run'). ISO yyyy-mm-dd. */
  when?: string
  /** The end of a run. There is no such column yet, so this is captured and carried, not scheduled. */
  until?: string
  /** What the owner brings: a DJ, a giveaway, tickets, their own photos. */
  assets?: string[]
  /** the paragraph they wrote. The real first answer; everything else is read back from it. */
  described?: string
  /** what the owner said, in their words. The goal and the shape both come from it. */
  situations?: string[]
  goals?: PlanGoalKey[]
  /**
   * The follow-ups the model judged THIS brief still needs, with its reason for each.
   *
   * Undefined means no read happened and the situation's standing list applies. An empty array is a
   * real answer: the paragraph covered everything.
   */
  asked?: { q: PlanQuestion; why: string }[]
  /** A named slow stretch. Not a goal — a WHEN, layered on top of whichever goals were picked. */
  shift?: string[]
  budget?: number
  promote?: string[]
  audience?: string[]
  reach?: Reach
  avoid?: string[]
  notes?: string
  /** Which questions the owner handed back to us, so the plan can say so rather than imply choice. */
  auto?: { goals?: boolean; promote?: boolean; audience?: boolean }
}

type Opt = { v: string; label: string; sub?: string }

/** Icons live here, not in plan-goals.ts, so that module stays free of React imports. */
const GOAL_ICON: Record<string, typeof Users> = {
  'more-new': Users,
  reviews: Star,
  'bigger-checks': TrendingUp,
  catering: Users,
  'own-takeout': Store,
  'get-known': Megaphone,
  regulars: Moon,
}

/**
 * The slow stretch, asked separately. It used to be one of the four goal cards, which was a category
 * error: "busier quiet nights" is not a different outcome from "more new people", it is the same
 * outcome on a Tuesday. As a goal it crowded out a real one; as a WHEN it sharpens whichever goal
 * was actually picked.
 */
/**
 * Onboarding stored the old four-goal vocabulary. Map it forward rather than re-asking a question
 * we already have an answer to. "slow-nights" deliberately lands on more-new: it was never its own
 * outcome, and the shift question below picks up the rest of its meaning.
 */
const ONBOARDING_GOAL: Record<string, PlanGoalKey> = {
  'new-customers': 'more-new',
  firstvisit: 'more-new',
  'slow-nights': 'more-new',
  nights: 'more-new',
  reviews: 'reviews',
  regulars: 'regulars',
}

const SHIFTS: Opt[] = [
  { v: 'Monday to Wednesday', label: 'Early week', sub: 'Mon, Tue, Wed' },
  { v: 'Thursday', label: 'Thursdays', sub: '' },
  { v: 'Sunday', label: 'Sundays', sub: '' },
  { v: 'Lunch', label: 'Lunch', sub: 'The midday shift' },
  { v: 'The late window', label: 'Late', sub: 'After the rush' },
  { v: 'The whole off-season', label: 'Off-season', sub: 'The slow months' },
]

/** Uneven on purpose: the real decisions live under $2,000, and the top end is a long tail. */
const STOPS = [150, 250, 400, 600, 800, 1100, 1500, 2000, 3000, 4000, 6000, 8000, 10000]

/** Everything a restaurant advertises that is not a dish. The menu is offered alongside these. */
const PROMOTE_OTHER: { group: string; items: Opt[] }[] = [
  {
    group: 'The place',
    items: [
      { v: 'The bar and the drinks', label: 'The bar', sub: 'Cocktails, wine, the list' },
      { v: 'The patio or outdoor space', label: 'The patio', sub: 'Outdoor seating, the terrace' },
      { v: 'The room itself', label: 'The room', sub: 'The space, the light, the feel' },
      { v: 'A private or group space', label: 'Private space', sub: 'Back room, big tables' },
    ],
  },
  {
    group: 'What you do',
    items: [
      { v: 'A weekly night or event', label: 'A weekly night', sub: 'Trivia, music, game day' },
      { v: 'Happy hour', label: 'Happy hour', sub: 'The early window' },
      { v: 'Catering and private events', label: 'Catering', sub: 'Parties, offices, functions' },
      { v: 'Takeout and delivery', label: 'Takeout', sub: 'Off-premise, delivery apps' },
    ],
  },
  {
    group: 'Who you are',
    items: [
      { v: 'The chef or the owner', label: 'The chef', sub: 'The person behind it' },
      { v: 'The family story', label: 'The story', sub: 'How it started, who runs it' },
      { v: 'How long you have been here', label: 'The years', sub: 'Longevity, the institution' },
      { v: 'An award or a write-up', label: 'The press', sub: 'A review, a list, a prize' },
    ],
  },
]

/** Who walks in: age, life stage and occasion together, because owners think in all three. */
const AUDIENCE: Opt[] = [
  { v: 'Young professionals', label: 'Young professionals', sub: 'Mid twenties to forties, after work' },
  { v: 'Families with kids', label: 'Families', sub: 'Kids in tow, early evening' },
  { v: 'Students', label: 'Students', sub: 'Price matters, late hours' },
  { v: 'Older regulars', label: 'Older regulars', sub: 'Fifty-five and up, daytime and early' },
  { v: 'Couples and date night', label: 'Date night', sub: 'Couples, weekend, unhurried' },
  { v: 'Groups and celebrations', label: 'Groups', sub: 'Birthdays, work dos, big tables' },
  { v: 'The weekday lunch crowd', label: 'Lunch crowd', sub: 'Nearby offices, fast, weekday' },
  { v: 'Late night', label: 'Late night', sub: 'After the bars, after a shift' },
  { v: 'Visitors and tourists', label: 'Visitors', sub: 'Hotels, sightseers, passing through' },
]

const REACH: { v: Reach; label: string; sub: string }[] = [
  { v: 'walk', label: 'The block', sub: 'People who can walk here' },
  { v: 'local', label: 'The neighbourhood', sub: 'A mile or two out' },
  { v: 'city', label: 'The whole city', sub: 'Worth crossing town for' },
  { v: 'region', label: 'The wider region', sub: 'Worth a drive' },
  { v: 'anywhere', label: 'Anywhere', sub: 'We ship or deliver beyond the area' },
]

/** What NOT to do. Every one of these is a real complaint an owner has had about marketing. */
const AVOID: Opt[] = [
  { v: 'Discounts and deals', label: 'Discounts', sub: 'Nothing that reads as cheap' },
  { v: 'Anything about price', label: 'Price talk', sub: 'Leave the numbers out' },
  { v: 'Staff or faces on camera', label: 'Faces on camera', sub: 'Nobody on film' },
  { v: 'Alcohol front and centre', label: 'Alcohol-led', sub: 'Keep drink out of the lead' },
  { v: 'Emoji and slang', label: 'Emoji and slang', sub: 'Keep the tone straight' },
  { v: 'Trends and memes', label: 'Trends', sub: 'No chasing the feed' },
  { v: 'Comparing us to others', label: 'Comparisons', sub: 'Never name a competitor' },
  { v: 'Politics or anything topical', label: 'Anything topical', sub: 'Stay out of the news' },
]

const CSS = `
.ps-slider { -webkit-appearance:none; appearance:none; width:100%; height:34px; background:transparent; cursor:grab; }
.ps-slider:active { cursor:grabbing; }
.ps-slider::-webkit-slider-runnable-track { height:6px; border-radius:99px; background:var(--ps-track); }
.ps-slider::-moz-range-track { height:6px; border-radius:99px; background:var(--ps-track); }
.ps-slider::-webkit-slider-thumb { -webkit-appearance:none; appearance:none; width:30px; height:30px; margin-top:-12px;
  border-radius:99px; background:#fff; border:2.5px solid #4abd98; box-shadow:0 2px 10px rgba(0,0,0,.16); }
.ps-slider::-moz-range-thumb { width:30px; height:30px; border-radius:99px; background:#fff;
  border:2.5px solid #4abd98; box-shadow:0 2px 10px rgba(0,0,0,.16); }
.ps-pick { transition: transform .12s ease, border-color .12s ease, background .12s ease; }
.ps-pick:active { transform: scale(.975); }

/* The first question is a page you write on, not a form field on a card. No border, no fill, no
   focus ring — the caret is the only affordance it needs, and anything else competes with the
   sentence being written. */
.ps-say { -webkit-appearance:none; appearance:none; }
.ps-say::placeholder { color:#c3c3c8; }
.ps-say:focus { outline:none; }
.ps-go { transition: opacity .18s ease, transform .12s ease; }
.ps-go:active:not(:disabled) { transform: scale(.985); }

@media (prefers-reduced-motion: reduce) { .ps-pick, .ps-go { transition:none } }
`

/* ────────────────────────────────────────────────────────────────────────────────── bits ── */

function Act({ n, of, title, sub, children }: { n: number; of: number; title: string; sub: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 38 }}>
      {/* The whole marker, not just the count, waits until there is a sequence to be inside. On the
          opening screen there are no follow-ups yet, so a badge reading "1" and a count reading
          "1 OF 1" are both furniture around a question that has not been answered. */}
      {of > n && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 7 }}>
          <span style={{ width: 22, height: 22, borderRadius: 99, background: C.ink, color: '#fff', fontSize: 11.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {n}
          </span>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', color: C.faint }}>{n} OF {of}</span>
        </div>
      )}
      <h2 style={{ fontFamily: DISPLAY, fontSize: 27, fontWeight: 600, color: C.ink, lineHeight: 1.12, margin: '0 0 6px', letterSpacing: '-0.024em' }}>{title}</h2>
      <p style={{ fontSize: 14, color: C.mute, lineHeight: 1.5, margin: '0 0 22px', maxWidth: '30ch' }}>{sub}</p>
      {children}
    </section>
  )
}

function Card({ on, label, sub, badge, dim, onClick }: { on: boolean; label: string; sub?: string; badge?: string; dim?: boolean; onClick: () => void }) {
  return (
    <button
      type="button" onClick={onClick} className="ps-pick" disabled={dim}
      style={{
        position: 'relative', textAlign: 'left', cursor: dim ? 'default' : 'pointer', opacity: dim ? 0.4 : 1,
        border: `1.5px solid ${on ? C.green : C.line}`, background: on ? C.greenSoft : '#fff',
        borderRadius: 15, padding: '11px 12px', fontFamily: "'Inter',system-ui,sans-serif",
      }}
    >
      <span style={{ display: 'block', fontSize: 13.5, fontWeight: on ? 700 : 600, color: on ? C.greenDk : C.ink, lineHeight: 1.25, paddingRight: on ? 20 : 0 }}>{label}</span>
      {sub && <span style={{ display: 'block', fontSize: 11.5, color: C.mute, marginTop: 3, lineHeight: 1.35 }}>{sub}</span>}
      {badge && <span style={{ display: 'inline-block', marginTop: 6, fontSize: 10, fontWeight: 700, color: C.greenDk, background: '#fff', border: `1px solid ${C.green}`, borderRadius: 99, padding: '1px 7px' }}>{badge}</span>}
      {on && (
        <span style={{ position: 'absolute', top: 10, right: 10, width: 18, height: 18, borderRadius: 99, background: C.green, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Check size={11} strokeWidth={3.4} />
        </span>
      )}
    </button>
  )
}

function Grid({ children, cols = 2 }: { children: React.ReactNode; cols?: number }) {
  return <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 9 }}>{children}</div>
}

/**
 * Hand the question back to us — and say what we would use, and where it came from.
 *
 * The value of this control is entirely in the second half. "Decide for me" that silently picks
 * something is how an owner ends up with a plan they never agreed to and cannot explain.
 */
function DecideForMe({ on, resolves, onToggle }: { on: boolean; resolves: string; onToggle: () => void }) {
  return (
    <div style={{ marginTop: 10 }}>
      <button
        type="button" onClick={onToggle} className="ps-pick"
        style={{
          width: '100%', textAlign: 'left', cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'flex-start',
          border: `1.5px ${on ? 'solid' : 'dashed'} ${on ? C.green : C.line}`, background: on ? C.greenSoft : '#fff',
          borderRadius: 15, padding: '12px 13px', fontFamily: "'Inter',system-ui,sans-serif",
        }}
      >
        <Wand2 size={16} style={{ color: on ? C.greenDk : C.faint, flex: '0 0 auto', marginTop: 1 }} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 13.5, fontWeight: on ? 700 : 600, color: on ? C.greenDk : C.ink }}>Decide for me</span>
          <span style={{ display: 'block', fontSize: 11.5, color: on ? C.greenDk : C.mute, marginTop: 3, lineHeight: 1.4 }}>
            {on ? `We will use: ${resolves}` : 'We will pick from what you have already told us.'}
          </span>
        </span>
      </button>
    </div>
  )
}

/* ───────────────────────────────────────────────────────────────────────────────── screen ── */

export default function PlanSetup({
  inputs,
  onBuild,
  initialAnswers,
}: {
  inputs: PlanInputs
  onBuild: (a: Answers) => void
  initialAnswers?: Answers
}) {
  const seed: Answers = {
    goals: isKnown(inputs.goal) ? [ONBOARDING_GOAL[String(inputs.goal.value)] ?? 'more-new'] : [],
    /* Carried through untouched. Never asked, and no longer used to size anything here — the plan
     * is built first and priced after, so the money question belongs on the plan, not in intake. */
    budget: isKnown(inputs.budget) ? (inputs.budget.value as number) : undefined,
    promote: isKnown(inputs.knownFor) ? (inputs.knownFor.value as string[]) : [],
    audience: isKnown(inputs.audience) ? (inputs.audience.value as string[]) : [],
    reach: 'local',
    avoid: [],
    auto: {},
    ...initialAnswers,
  }
  const [a, setA] = useState<Answers>(seed)
  const connect = connectRecommendations(inputs)

  const goals = a.goals ?? []
  const shift = a.shift ?? []
  const situations = a.situations ?? []
  const picked = situations.map(situationByValue).filter(Boolean) as NonNullable<ReturnType<typeof situationByValue>>[]
  /* Derived, never asked. The first pick fixes the shape and the rest must agree with it. */
  const shape = picked[0]?.shape
  const dated = shape === 'date' || shape === 'run'
  const assets = a.assets ?? []
  /* Owner-supplied work is not bought again. Merged into `have`, so a covered service renders as
   * "you already have this" at zero through the path that is already tested. */
  const covered = useMemo(() => assetsCover(assets), [assets.join(',')])
  const promote = a.promote ?? []
  const audience = a.audience ?? []
  const reach = a.reach ?? 'local'
  const avoid = a.avoid ?? []
  const auto = a.auto ?? {}

  /*
   * WHAT IS LEFT TO ASK, rather than a fixed list everyone answers.
   *
   * A question survives two filters: it has to be able to change THIS plan (the situation says so),
   * and we have to not already know the answer, either from onboarding or from the paragraph they
   * just wrote. Someone fixing their review score was previously asked which menu items to promote
   * and which nights are slow, neither of which touches a review plan.
   *
   * A good description can empty this list. When it does the honest move is to go straight to the
   * plan, not to invent a question so the screen looks thorough.
   */
  const gaps = useMemo(
    () => gapsFor(
      situations,
      {
        assets: assets.length > 0,
        promote: promote.length > 0 || !!auto.promote || isKnown(inputs.knownFor),
        reach: false,
        shift: shift.length > 0 || isKnown(inputs.slowDays),
        avoid: false,
      },
      /* What the model decided this particular brief needs, when it got a look. Undefined falls
       * back to the situation's standing list, so a dead model costs relevance, not the flow. */
      a.asked ? a.asked.map((x) => x.q) : undefined,
    ),
    [situations.join(','), assets.length, promote.length, auto.promote, shift.length, inputs, a.asked],
  )
  const asks = (q: string) => gaps.includes(q as never)
  /** The model's reason for asking this one, in the owner's own terms. Empty when it did not run. */
  const whyAsk = (q: string) => a.asked?.find((x) => x.q === q)?.why ?? ''
  /* Numbered by position among the questions that survived, so it never reads "3 of 2". */
  const actN = (q: string) => gaps.indexOf(q as never) + 2

  const menu = inputs.menu.slice(0, 10)
  const g = goals.length ? goals : undefined
  const hasShift = shift.length > 0
  const dropped = excludedByReach(reach)

  // What "Decide for me" would actually use, per question, said out loud.
  const autoGoal = isKnown(inputs.goal) ? (inputs.goalWords.label ?? String(inputs.goal.value)) : 'more new people, the safe default for a first month'
  const autoPromote = menu.filter((m) => m.featured).map((m) => m.name).join(', ') || (menu[0]?.name ?? 'the room and what you are known for')
  const autoAud = isKnown(inputs.audience) ? (inputs.audience.value as string[]).join(', ') : 'people who live nearby'

  const set = (patch: Partial<Answers>) => setA({ ...a, ...patch })

  /*
   * WHAT THEY WROTE, READ BACK AS PICKS.
   *
   * The description is the real first question. Everything below it is the read-back the owner
   * corrects, which is why a wrong parse costs a tap rather than a wrong plan. When the model is
   * unavailable the words are still captured and still reach the team, so the box is never wasted
   * effort — it just stops being instant.
   */
  const [reading, setReading] = useState(false)
  const [readErr, setReadErr] = useState<string | null>(null)
  const [readBack, setReadBack] = useState<{ summary: string; unsupported: string[] } | null>(null)

  /**
   * Keep the flow moving when the model does not answer.
   *
   * The situation is what everything downstream hangs off, and with no list on this screen the
   * parse is the only thing that sets it. That made one API call a single point of failure for the
   * entire builder, and we have already watched it fail: an empty Anthropic balance took the front
   * door out for everyone, quietly. matchSituation is the floor — worse than the model, and enough
   * to keep going.
   *
   * It sets ONLY the situation. The date and the assets stay unset on purpose, because guessing
   * those from keywords would be inventing answers rather than degrading gracefully; the follow-up
   * questions ask for them instead, which is what those questions are for.
   */
  const fallbackRead = (text: string) => {
    const m = matchSituation(text)
    if (!m) return false
    set({ situations: [m.situation.v], goals: [m.situation.goal], shape: m.situation.shape })
    return true
  }

  const describe = async () => {
    const text = (a.described ?? '').trim()
    if (text.length < 12 || reading) return
    setReading(true)
    setReadErr(null)
    try {
      const r = await fetch('/api/campaigns/describe', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }),
      })
      const j = (await r.json()) as { ok?: boolean; reason?: string; result?: Record<string, unknown> }
      if (!j.ok || !j.result) { fallbackRead(text); setReadErr(String(j.reason ?? 'upstream')); setReadBack(null); return }
      const res = j.result as {
        situation: string | null; shape?: string; when: string | null; until: string | null
        assets: string[]; summary: string; unsupported: string[]
        ask?: { q: PlanQuestion; why: string }[]
      }
      setReadBack({ summary: res.summary, unsupported: res.unsupported ?? [] })
      const sit = res.situation ? situationByValue(res.situation) : undefined
      set({
        ...(sit ? { situations: [sit.v], goals: [sit.goal], shape: sit.shape } : {}),
        ...(res.when ? { when: res.when } : {}),
        ...(res.until ? { until: res.until } : {}),
        ...(res.assets?.length ? { assets: res.assets } : {}),
        /* Only when we actually understood the brief. Honouring an `ask` from a read that could not
         * place the situation would let a stray [] skip every follow-up on a plan built from
         * nothing. */
        ...(sit && Array.isArray(res.ask) ? { asked: res.ask } : {}),
      })
    } catch {
      fallbackRead(text)
      setReadErr('unreachable')
    } finally {
      setReading(false)
    }
  }
  const flip = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])
  const setAuto = (k: 'goals' | 'promote' | 'audience', on: boolean) => set({ auto: { ...auto, [k]: on } })

  /* A description on its own is enough. If we could not parse it, a person reads it. */
  const goalsOk = auto.goals || situations.length > 0 || (a.described ?? '').trim().length >= 12
  const promoteOk = !gaps.includes('promote') || auto.promote || promote.length > 0
  /* A dated campaign without its date is not buildable: the whole schedule works backwards from it. */
  /* A dated campaign without its date is not buildable: the whole schedule works backwards from it.
   * "auto" means they handed the decision back, which resolves to an ongoing plan. */
  const shapeOk = auto.goals || (!!shape && (shape === 'ongoing' || !!a.when))
  const ready = shapeOk && goalsOk && promoteOk

  return (
    <div style={{ background: C.bg, minHeight: '100%', padding: '18px 14px 28px', fontFamily: "'Inter',system-ui,sans-serif", boxSizing: 'border-box' }}>
      <style>{CSS}</style>

      {/* Three headings used to stack here: the page header, a "Design a campaign" title, and the
          question itself — a whole phone screen of throat-clearing before anything to act on. The
          title is gone; what is left is the one line that tells them how much is still coming, and
          that line only says something once there is something to say. */}
      {situations.length > 0 && (
        <div style={{ fontSize: 13.5, color: C.mute, marginBottom: 26, lineHeight: 1.5 }}>
          {gaps.length === 0
            ? 'Nothing else to ask. We have the rest from your account and from what you wrote.'
            : gaps.length === 1
              ? 'One more question, then we build it.'
              : `${gaps.length} more questions, then we build it.`}
        </div>
      )}

      {/* 1 ── the situation, in their words. The shape falls out of it and is never asked about:
              an owner does not think "is this a dated moment", they think "we are opening".

              ONE BOX, NO LIST. A picker stood here briefly and was wrong twice over: the eleven
              entries were goals ("we want bigger checks") rather than the campaigns an owner would
              recognise, and offering any list at all quietly reframes a bespoke builder as a
              catalogue you choose from. What they describe is richer than anything a list can hold
              — the date, the DJ they can book, the fact that they will do "whatever it takes" — and
              all of it survives to the people doing the work. */}
      <Act
        n={1}
        of={1 + gaps.length}
        title="What do you want to do?"
        sub="Say it the way you would say it to a person. We work out the rest."
      >
        {/* No card, no border, no fill. The sentence they are writing is the only thing on the
            screen with any weight, so it gets the page rather than a field on top of one, and it is
            set at reading size rather than form-input size. A bulleted "worth mentioning" list used
            to sit under here teaching the format; the placeholder already does that in one line,
            and the list was three more things to read before you could start. */}
        <textarea
          className="ps-say"
          value={a.described ?? ''}
          onChange={(e) => { set({ described: e.target.value, asked: undefined }); setReadBack(null); setReadErr(null) }}
          placeholder="We're opening a second location in September and I want a line out the door on day one."
          rows={4}
          style={{
            width: '100%', border: 'none', outline: 'none', resize: 'none', background: 'transparent',
            padding: 0, margin: 0, display: 'block',
            fontFamily: "'Inter',system-ui,sans-serif", fontSize: 19, lineHeight: 1.5,
            letterSpacing: '-0.011em', color: C.ink, minHeight: 132,
          }}
        />

        {/* Full width, and quiet until there is something to send. The old control was a 34px pill
            tucked in a footer beside a caption, which made the one action on the screen the
            smallest thing on it. */}
        <button
          type="button" className="ps-go" onClick={describe}
          disabled={reading || (a.described ?? '').trim().length < 12}
          style={{
            width: '100%', height: 50, marginTop: 8, borderRadius: 25, border: 'none',
            cursor: (a.described ?? '').trim().length < 12 ? 'default' : 'pointer',
            background: (a.described ?? '').trim().length < 12 ? '#ececee' : C.green,
            color: (a.described ?? '').trim().length < 12 ? C.faint : '#fff',
            fontFamily: "'Inter',system-ui,sans-serif", fontSize: 16, fontWeight: 620, letterSpacing: '-0.01em',
          }}
        >
          {reading ? 'Reading…' : 'Continue'}
        </button>

        <div style={{ fontSize: 12, color: C.faint, textAlign: 'center', marginTop: 11, lineHeight: 1.45 }}>
          Anything you write reaches the people doing the work.
        </div>

        {/* What we understood, in their terms, above the picks it filled in. */}
        {readBack && (
          <div style={{ marginTop: 11, padding: '12px 13px', background: '#f0faf6', borderRadius: 14 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <Check size={14} strokeWidth={2.6} color={C.green} style={{ flexShrink: 0, marginTop: 2 }} />
              <span style={{ fontSize: 13, color: C.ink, lineHeight: 1.45 }}>{readBack.summary} <span style={{ color: C.mute }}>Correct anything below if we got it wrong.</span></span>
            </div>
            {readBack.unsupported.length > 0 && (
              <div style={{ marginTop: 9, paddingTop: 9, borderTop: `0.5px solid ${C.line}`, fontSize: 12.5, color: AMBER_DK, lineHeight: 1.45 }}>
                We do not do {readBack.unsupported.join(', ')}. Everything else below we can.
              </div>
            )}
          </div>
        )}

        {/* The model is unavailable, but the local matcher already worked out what this is, so the
            flow continues. Say that plainly rather than dressing a degraded read as a full one:
            the difference is real (no date, no assets read out of the text), and the owner should
            know which one they got before they trust the plan on the other side. */}
        {readErr && (
          <div style={{ marginTop: 11, padding: '12px 13px', background: AMBER_SOFT, borderRadius: 14, fontSize: 12.5, color: AMBER_DK, lineHeight: 1.5 }}>
            {readErr === 'too-short'
              ? 'Give us a sentence or two more and we will read it back.'
              : situations.length > 0
                ? 'We could not read that back in full just now, so we went on the words we recognised. Check the answers below, and add the date yourself if there is one. What you wrote is saved and reaches the team either way.'
                : 'We could not read that one. Try saying it a different way, or carry on and a person on our team reads exactly what you wrote.'}
          </div>
        )}

        {/* The one thing we will not sell. It used to sit under the card list as a standing note;
            with no list it fires on what we actually understood, which is when it matters. Someone
            can still describe a retention problem in the box — the read is correct, and the answer
            is that we do not sell it yet, said before they go any further rather than after. */}
        {picked.map((p) => PLAN_GOALS.find((g) => g.key === p.goal)).filter((g) => g && g.state !== 'ready' && g.soonWhy).map((g) => (
          <div key={g!.key} style={{ display: 'flex', gap: 8, marginTop: 11, padding: '10px 12px', background: AMBER_SOFT, borderRadius: 12, fontSize: 12, color: AMBER_DK, lineHeight: 1.45 }}>
            <Ban size={14} strokeWidth={2.2} style={{ flexShrink: 0, marginTop: 1 }} />
            <span><strong style={{ fontWeight: 600 }}>That is the one thing we cannot do yet.</strong> {g!.soonWhy}</span>
          </div>
        ))}

        {/* The date, asked only once something dated has been picked, and worded for that thing. */}
        {dated && (
          <div style={{ marginTop: 14, background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, padding: '14px 15px' }}>
            {shape === 'date' ? (
              <>
                <label htmlFor="ps-when" style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: C.ink, marginBottom: 3 }}>
                  {picked[0]?.v === 'opening' ? 'When do you open?' : 'When is it?'}
                </label>
                <div style={{ fontSize: 12, color: C.mute, lineHeight: 1.45, marginBottom: 9 }}>Everything is worked backwards from this, so the last push lands on the day.</div>
                <input
                  id="ps-when" type="date" value={a.when ?? ''} onChange={(e) => set({ when: e.target.value })}
                  style={{ width: '100%', height: 44, border: `1px solid ${C.line}`, borderRadius: 12, padding: '0 12px', fontSize: 15, color: C.ink, fontFamily: "'Inter',system-ui,sans-serif", background: '#fff' }}
                />
              </>
            ) : (
              <>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink, marginBottom: 3 }}>How long is it on for?</div>
                <div style={{ fontSize: 12, color: C.mute, lineHeight: 1.45, marginBottom: 9 }}>The day it starts, and the day it comes off.</div>
                <div style={{ display: 'flex', gap: 9 }}>
                  <input aria-label="Starts" type="date" value={a.when ?? ''} onChange={(e) => set({ when: e.target.value })}
                    style={{ flex: 1, minWidth: 0, height: 44, border: `1px solid ${C.line}`, borderRadius: 12, padding: '0 10px', fontSize: 15, color: C.ink, fontFamily: "'Inter',system-ui,sans-serif", background: '#fff' }} />
                  <input aria-label="Ends" type="date" value={a.until ?? ''} onChange={(e) => set({ until: e.target.value })}
                    style={{ flex: 1, minWidth: 0, height: 44, border: `1px solid ${C.line}`, borderRadius: 12, padding: '0 10px', fontSize: 15, color: C.ink, fontFamily: "'Inter',system-ui,sans-serif", background: '#fff' }} />
                </div>
                <div style={{ fontSize: 11.5, color: AMBER_DK, background: AMBER_SOFT, borderRadius: 9, padding: '8px 10px', marginTop: 9, lineHeight: 1.45 }}>
                  We record the end date and the team works to it. The automatic schedule counts back from the start, so a long run gets checked by a person.
                </div>
              </>
            )}
          </div>
        )}

        {/* Which shifts, asked only when they said shifts were the problem. */}
        {asks('shift') && (
          <div style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
              <Clock size={14} strokeWidth={2.2} color={C.mute} />
              <span style={{ fontSize: 13.5, fontWeight: 600, color: C.ink }}>Which ones?</span>
            </div>
            <div style={{ fontSize: 12, color: C.mute, lineHeight: 1.45, marginBottom: 10 }}>Naming them aims the same work at the shifts that sit empty.</div>
            <Grid>
              {SHIFTS.map((o) => {
                const on = shift.includes(o.v)
                return (
                  <button
                    key={o.v} type="button" className="ps-pick"
                    onClick={() => set({ shift: flip(shift, o.v) })}
                    style={{
                      textAlign: 'left', cursor: 'pointer', border: `1.5px solid ${on ? C.green : C.line}`,
                      background: on ? '#f0faf6' : '#fff', borderRadius: 14, padding: '11px 12px',
                      fontFamily: "'Inter',system-ui,sans-serif",
                    }}
                  >
                    <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: on ? C.green : C.ink }}>{o.label}</span>
                    {o.sub && <span style={{ display: 'block', fontSize: 11, color: C.mute, marginTop: 2 }}>{o.sub}</span>}
                  </button>
                )
              })}
            </Grid>
          </div>
        )}

        {/* Held back until there is something written. On an empty screen a dashed "Decide for me"
            card is a second, competing offer next to the only thing we want them to do, and it is
            answering a question they have not been asked yet. */}
        {((a.described ?? '').trim().length > 0 || situations.length > 0 || !!auto.goals) && (
          <DecideForMe on={!!auto.goals} resolves={autoGoal} onToggle={() => { setAuto('goals', !auto.goals); if (!auto.goals) set({ situations: [], goals: [], shape: undefined, auto: { ...auto, goals: true } }) }} />
        )}
      </Act>

      {/* 2 ── what the owner brings. Nothing captured this before, and both real event requests
              opened with it. */}
      {/* Nothing left to ask is a result, not an empty state. Say so and get out of the way. */}
      {situations.length > 0 && gaps.length === 0 && (
        <div style={{ display: 'flex', gap: 9, padding: '13px 14px', background: '#f0faf6', borderRadius: 16, marginBottom: 4 }}>
          <Check size={15} strokeWidth={2.6} color={C.green} style={{ flexShrink: 0, marginTop: 2 }} />
          <span style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.45 }}>
            That is everything we need. We already have the rest from your account and from what you wrote.
          </span>
        </div>
      )}

      {asks('assets') && <Act n={actN('assets')} of={1 + gaps.length} title="What have you got to work with?" sub={whyAsk('assets') || 'Anything you already have, or could get easily. We build around it instead of billing you for it.'}>
        <Grid>
          {OWNER_ASSETS.map((o) => {
            const on = assets.includes(o.v)
            const none = o.v === 'Nothing yet'
            return (
              <button
                key={o.v} type="button" className="ps-pick"
                onClick={() => set({ assets: none ? (on ? [] : [o.v]) : flip(assets.filter((x) => x !== 'Nothing yet'), o.v) })}
                style={{
                  textAlign: 'left', cursor: 'pointer', border: `1.5px solid ${on ? C.green : C.line}`,
                  background: on ? '#f0faf6' : '#fff', borderRadius: 14, padding: '11px 12px',
                  fontFamily: "'Inter',system-ui,sans-serif", borderStyle: none ? 'dashed' : 'solid',
                }}
              >
                <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: on ? C.green : C.ink }}>{o.label}</span>
                <span style={{ display: 'block', fontSize: 11, color: C.mute, marginTop: 2, lineHeight: 1.35 }}>{o.sub}</span>
              </button>
            )
          })}
        </Grid>
        {covered.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginTop: 11, padding: '10px 12px', background: '#f0faf6', borderRadius: 12, fontSize: 12.5, color: C.ink, lineHeight: 1.45 }}>
            <Check size={14} strokeWidth={2.6} color={C.green} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>Because you have your own, we will not charge you for {covered.length === 1 ? 'a shoot' : 'photography'}. It still shows on the plan, at zero.</span>
          </div>
        )}
      </Act>}

      {/* 3 ── what to promote */}
      {asks('promote') && <Act n={actN('promote')} of={1 + gaps.length} title="What should we put in front of people?" sub={whyAsk('promote') || 'Your menu, and everything else worth showing. Pick as many as fit.'}>
        {menu.length > 0 && (
          <>
            <GroupLabel>From your menu</GroupLabel>
            <Grid>
              {menu.map((m) => (
                <Card key={m.id} on={promote.includes(m.name)} label={m.name} badge={m.featured ? 'You featured this' : undefined}
                  dim={auto.promote} onClick={() => set({ promote: flip(promote, m.name), auto: { ...auto, promote: false } })} />
              ))}
            </Grid>
          </>
        )}
        {PROMOTE_OTHER.map((g) => (
          <div key={g.group}>
            <GroupLabel>{g.group}</GroupLabel>
            <Grid>
              {g.items.map((o) => (
                <Card key={o.v} on={promote.includes(o.v)} label={o.label} sub={o.sub}
                  dim={auto.promote} onClick={() => set({ promote: flip(promote, o.v), auto: { ...auto, promote: false } })} />
              ))}
            </Grid>
          </div>
        ))}
        {menu.length === 0 && (
          <div style={{ fontSize: 11.5, color: C.faint, marginTop: 10, lineHeight: 1.45 }}>
            We do not have your menu yet.{' '}
            <a href="/dashboard/business-info/menu" style={{ color: C.greenDk, fontWeight: 700 }}>Add it</a>{' '}
            and your actual dishes appear here.
          </div>
        )}
        <DecideForMe on={!!auto.promote} resolves={autoPromote} onToggle={() => { setAuto('promote', !auto.promote); if (!auto.promote) set({ promote: [], auto: { ...auto, promote: true } }) }} />
      </Act>}

      {/* 4 ── who, and how far */}
      {asks('reach') && <Act n={actN('reach')} of={1 + gaps.length} title="Who are you trying to reach?" sub={whyAsk('reach') || 'Who walks in, and how far you want to pull from. Both change the work.'}>
        <GroupLabel>Who</GroupLabel>
        <Grid>
          {AUDIENCE.map((o) => (
            <Card key={o.v} on={audience.includes(o.v)} label={o.label} sub={o.sub}
              dim={auto.audience} onClick={() => set({ audience: flip(audience, o.v), auto: { ...auto, audience: false } })} />
          ))}
        </Grid>
        <GroupLabel>How far</GroupLabel>
        <Grid>
          {REACH.map((r) => (
            <Card key={r.v} on={reach === r.v} label={r.label} sub={r.sub} onClick={() => set({ reach: r.v })} />
          ))}
        </Grid>
        {dropped.length > 0 && (
          <div style={{ fontSize: 11.5, color: AMBER_DK, background: AMBER_SOFT, borderRadius: 12, padding: '10px 12px', marginTop: 10, lineHeight: 1.5 }}>
            Because you serve beyond your area, we have taken out the work that only pays off for a
            fixed address people walk into: {dropped.join(', ')}. You are not charged for them.
          </div>
        )}
        <DecideForMe on={!!auto.audience} resolves={autoAud} onToggle={() => { setAuto('audience', !auto.audience); if (!auto.audience) set({ audience: [], auto: { ...auto, audience: true } }) }} />
      </Act>}

      {/* 5 ── what to avoid */}
      {asks('avoid') && <Act n={actN('avoid')} of={1 + gaps.length} title="Anything we should never do?" sub={whyAsk('avoid') || 'Optional, and the one place a plan most often goes wrong. Pick anything that is off limits.'}>
        <Grid>
          {AVOID.map((o) => {
            const on = avoid.includes(o.v)
            return (
              <button
                key={o.v} type="button" className="ps-pick" onClick={() => set({ avoid: flip(avoid, o.v) })}
                style={{
                  position: 'relative', textAlign: 'left', cursor: 'pointer',
                  border: `1.5px solid ${on ? '#c0564f' : C.line}`, background: on ? '#fdeeee' : '#fff',
                  borderRadius: 15, padding: '11px 12px', fontFamily: "'Inter',system-ui,sans-serif",
                }}
              >
                <span style={{ display: 'block', fontSize: 13.5, fontWeight: on ? 700 : 600, color: on ? '#c0564f' : C.ink, lineHeight: 1.25, paddingRight: on ? 20 : 0 }}>{o.label}</span>
                <span style={{ display: 'block', fontSize: 11.5, color: C.mute, marginTop: 3, lineHeight: 1.35 }}>{o.sub}</span>
                {on && (
                  <span style={{ position: 'absolute', top: 10, right: 10, width: 18, height: 18, borderRadius: 99, background: '#c0564f', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Ban size={11} strokeWidth={3} />
                  </span>
                )}
              </button>
            )
          })}
        </Grid>
      </Act>}

      {/* Also waits. Connecting Facebook is a real ask, but it is not the first thing someone came
          here to do, and on a blank screen it turns one question into a to-do list. */}
      {situations.length > 0 && connect.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <GroupLabel>Worth connecting</GroupLabel>
          {connect.map((c) => (
            <a key={c.key} href={c.href} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', textDecoration: 'none', background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, padding: '13px 14px', marginBottom: 9 }}>
              <Link2 size={16} style={{ color: C.greenDk, flex: '0 0 auto', marginTop: 2 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.ink, marginBottom: 2 }}>{c.name}</div>
                <div style={{ fontSize: 12, color: C.mute, lineHeight: 1.5 }}>{c.costOfMissing}</div>
              </div>
              <span style={{ flex: '0 0 auto', fontSize: 13, fontWeight: 700, color: C.greenDk, marginTop: 1 }}>Connect</span>
            </a>
          ))}
        </section>
      )}

      {/* A second, optional box on the same screen as the first one is just confusing: two places
          to type, and the smaller one carries a caption explaining which is which. It appears once
          the first question is answered, which is also the only point at which "anything else" is a
          question that can be understood. */}
      {situations.length > 0 && (
      <section style={{ marginBottom: 26 }}>
        <GroupLabel>Anything else</GroupLabel>
        <div style={{ fontSize: 12, color: C.faint, marginBottom: 9, lineHeight: 1.45 }}>
          Optional. The plan is built from your answers above; this goes to the people who do the work.
        </div>
        <div style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <MessageSquare size={16} style={{ color: C.faint, flex: '0 0 auto', marginTop: 9 }} />
          <textarea
            className="mvp-input" value={a.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} rows={3}
            placeholder="A big date coming up, something that flopped before, anything we should know."
            style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', padding: '8px 2px', fontSize: 16, border: 'none', outline: 'none', background: 'transparent', color: C.ink, resize: 'vertical', fontFamily: "'Inter',system-ui,sans-serif", lineHeight: 1.5 }}
          />
        </div>
      </section>
      )}

      {/* Also waits. Before the first question is answered this is a second, dead button sitting
          under the live one, saying what is still missing — which is everything. */}
      {situations.length > 0 && (
      <button
        type="button" onClick={() => onBuild({ ...a, shape, situations, goals, shift, assets, promote, audience, reach, avoid })} disabled={!ready}
        style={{
          width: '100%', height: 52, borderRadius: 15, border: 'none',
          background: ready ? C.green : '#bfe7da', color: '#fff', fontSize: 16.5, fontWeight: 700,
          cursor: ready ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          fontFamily: "'Inter',system-ui,sans-serif",
        }}
      >
        {ready
          ? 'Build my plan'
          : !goalsOk
            ? 'Tell us what you want to do'
            : !shapeOk
              ? (shape === 'date' ? 'Add the date' : 'Add the start date')
              : 'Pick something to promote, or let us decide'}
        {ready && <ArrowRight size={18} />}
      </button>
      )}

      {situations.length > 0 && (
        <div style={{ fontSize: 11.5, color: C.faint, lineHeight: 1.5, padding: '13px 4px 0', textAlign: 'center' }}>
          You pick when each piece goes out after the plan is built, not now.
        </div>
      )}
    </div>
  )
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: C.faint, margin: '18px 0 8px 2px' }}>
      {children}
    </div>
  )
}

function budgetMeans(v: number): string {
  if (v < 300) return 'The foundations: your listing, your site, and something to measure against.'
  if (v < 600) return 'The foundations, plus a steady drip of posts where people already look.'
  if (v < 1100) return 'All that, plus real reach and the reviews work that makes people choose you.'
  if (v < 2000) return 'Reach, reviews, and something to actually say: an event or a new item.'
  return 'Everything we can genuinely run for you today, across the whole funnel.'
}

/** Snap a stored budget (which came from an onboarding band) onto the nearest slider stop. */
function nearestStop(v: number): number {
  return STOPS.reduce((best, s) => (Math.abs(s - v) < Math.abs(best - v) ? s : best), STOPS[0])
}
