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

import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, MessageSquare, Link2, Check, Users, Star, Moon, TrendingUp, Wand2, Ban, Store, Megaphone } from 'lucide-react'
import { C, DISPLAY, AMBER_DK, AMBER_SOFT } from '@/components/mvp/mvp-detail'
import { DESK, DeskKeyframes, PlanSheet, type PlanSheetLine } from '@/components/campaigns/desk/ui'
import { connectRecommendations, isKnown, knownIn, type PlanInputs } from '@/lib/campaigns/data/plan-inputs'
import { signalNotes, type MonthlySignals } from '@/lib/campaigns/data/monthly-signals'
import {
  PLAN_GOALS,
  SITUATIONS,
  OWNER_ASSETS,
  goalReadiness,
  matchSituation,
  situationByValue,
  gapsFor,
  assetsCover,
  SHIFT_OPTIONS,
  AUDIENCE_OPTIONS,
  REACH_OPTIONS,
  AVOID_OPTIONS,
  PROMOTE_OTHER_OPTIONS,
  type DescribeRead,
  type PlanGoalKey,
  type PlanQuestion,
  type CampaignShape,
} from '@/lib/campaigns/data/plan-goals'
import { excludedByReach, datedAnchors, monthlyFloor, budgetCeiling, type Reach } from '@/lib/campaigns/data/monthly-plan'
import { offerApplies, demandSpikeApplies, suggestedTarget } from '@/lib/campaigns/data/campaign-ledger'
import { WALK_TITLES as WT, WALK_SUBS as WS, WALK_LINES as WL, ASSET_PAYOFF, CAPACITY_CHIPS, fill } from '@/lib/campaigns/data/walk-copy'
import WalkCalendar from './walk-calendar'
import type { GoalKey } from '@/lib/campaigns/types'

export interface Answers {
  /** A date, a run, or ongoing. Asked FIRST, because it decides which goals even make sense. */
  shape?: CampaignShape
  /** The day it happens (shape 'date'), or the start (shape 'run'). ISO yyyy-mm-dd. */
  when?: string
  /** When an ongoing plan should begin: 'asap' (the default) or an ISO date. Dated campaigns
   *  carry their timing in `when`/`until` instead. */
  start?: string
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
  /**
   * PROVENANCE (the ledger's Tier 2): which fields were READ out of the describe paragraph
   * rather than asked. Set by the describe read; the ledger uses it to classify tiers, and
   * Phase 3 uses it to remove already-answered questions from the walk.
   */
  readKeys?: string[]
  /** ASKED provenance for defaults-shaped answers: keys the owner explicitly tapped in the walk.
   *  Distinguishes "chose ASAP" (asked) from "never saw the question" (defaulted, said out loud
   *  on the plan). */
  touched?: string[]
  /* ── Offer economics (ledger fields; asked/read only when the campaign includes an offer;
   *    NEVER defaulted — owner rule 2026-07-29). Question UI arrives with Phase 3. ── */
  offerTerms?: string
  offerLimit?: string
  offerExpiry?: string
  /** Success target on the recipe's own proxy metric (never "incremental revenue"). Asked with
   *  a suggested number from comparable past campaigns; consumed by reporting + the mid-run
   *  pivot flag (Phase 4). */
  successTarget?: number
  /** The RESTAURANT's capacity to absorb a demand spike (staffing, prep, featured-item quantity,
   *  who briefs staff). Asked only for spike-shaped campaigns; separate from creator routing. */
  capacity?: string
}


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

/* The option vocabularies live in plan-goals with the rest of the walk's vocabulary, because the
 * describe read validates against the same lists these screens render (the model may not widen
 * the vocabulary). Aliased to their old local names. */
const SHIFTS = SHIFT_OPTIONS

/** Uneven on purpose: the real decisions live under $2,000, and the top end is a long tail. */
const STOPS = [150, 250, 400, 600, 800, 1100, 1500, 2000, 3000, 4000, 6000, 8000, 10000]

const PROMOTE_OTHER = PROMOTE_OTHER_OPTIONS

const AUDIENCE = AUDIENCE_OPTIONS

const REACH = REACH_OPTIONS

const AVOID = AVOID_OPTIONS

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
.ps-say::placeholder { color:#C7C7CC; }
.ps-say:focus { outline:none; }
.ps-go { transition: opacity .18s ease, transform .12s ease, box-shadow .25s ease, background .25s ease; }
.ps-go:active:not(:disabled) { transform: scale(.985); }

/* The writing surface, Apple-clean: a white card floating on light gray, one hairline border,
   one soft shadow, and a quiet mint ring only when the caret is inside. No texture. */
.ps-sheet {
  background: #FFFFFF;
  border: 0.5px solid rgba(0,0,0,0.08);
  border-radius: 22px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.04), 0 12px 32px rgba(0,0,0,0.06);
  transition: box-shadow .35s cubic-bezier(.25,.1,.25,1), border-color .35s cubic-bezier(.25,.1,.25,1);
}
.ps-sheet:focus-within {
  border-color: rgba(74,189,152,0.45);
  box-shadow: 0 1px 2px rgba(0,0,0,0.04), 0 12px 32px rgba(0,0,0,0.06), 0 0 0 4px rgba(74,189,152,0.12);
}

/* The staged entrance, on Apple timing: quick, weightless, done. */
@keyframes psRise { from { opacity:0; transform: translateY(10px) } to { opacity:1; transform:none } }
.ps-hero1 { animation: psRise .4s cubic-bezier(.25,.1,.25,1) both }
.ps-hero2 { animation: psRise .4s cubic-bezier(.25,.1,.25,1) .06s both }
.ps-hero3 { animation: psRise .4s cubic-bezier(.25,.1,.25,1) .12s both }
.ps-hero4 { animation: psRise .4s cubic-bezier(.25,.1,.25,1) .2s both }

.ps-chip { transition: transform .12s ease, background .15s ease, box-shadow .15s ease; }
.ps-chip:active { transform: scale(.98); }
.ps-chip:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.06); }

@media (prefers-reduced-motion: reduce) {
  .ps-pick, .ps-go, .ps-chip { transition:none }
  .ps-hero1, .ps-hero2, .ps-hero3, .ps-hero4 { animation:none }
}
`

/* ────────────────────────────────────────────────────────────────────────────────── bits ── */

function Act({ n, of, title, sub, children }: { n: number; of: number; title: string; sub: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 38 }}>
      {/* The marker waits until there is a sequence to be inside: a lone "1 OF 1" is furniture. */}
      {of > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 7 }}>
          {/* The desk's ink stage plate: a square, not a chip. */}
          <span style={{ width: 24, height: 24, borderRadius: 7, background: DESK.ink, color: DESK.paper, fontFamily: DISPLAY, fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {n}
          </span>
          <span style={{ fontFamily: DESK.mono, fontSize: 10.5, fontWeight: 700, letterSpacing: '.12em', color: DESK.mute }}>{n} OF {of}</span>
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
  signals,
  onBuild,
  initialAnswers,
}: {
  inputs: PlanInputs
  /** The brain's live read of THIS business (rating, list, listing health). Shown back as facts
   *  the plan will lean on, so wrong account data gets caught here instead of composing quietly. */
  signals?: MonthlySignals
  onBuild: (a: Answers) => void
  initialAnswers?: Answers
}) {
  const seed: Answers = {
    goals: isKnown(inputs.goal) ? [ONBOARDING_GOAL[String(inputs.goal.value)] ?? 'more-new'] : [],
    /* Deliberately NOT seeded from onboarding: `budget` now means "the owner typed a number into
     * THIS flow's optional last question". What they could spend months ago must not size this
     * plan — the old bug this module was rewritten to remove. */
    promote: isKnown(inputs.knownFor) ? (inputs.knownFor.value as string[]) : [],
    audience: isKnown(inputs.audience) ? (inputs.audience.value as string[]) : [],
    reach: 'local',
    start: 'asap',
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
  /* Which fields the describe read supplied (Ledger Tier 2). A read question is answered — the
   * law is never to ask what is already held — so it subtracts from the walk exactly like an
   * onboarding answer does. */
  const readKeys = a.readKeys ?? []
  const wasRead = (k: string) => readKeys.includes(k)
  const gaps = useMemo(
    () => gapsFor(
      situations,
      {
        assets: assets.length > 0,
        promote: promote.length > 0 || !!auto.promote || isKnown(inputs.knownFor),
        reach: wasRead('reach'),
        shift: shift.length > 0 || isKnown(inputs.slowDays),
        avoid: wasRead('avoid'),
      },
      /* What the model decided this particular brief needs, when it got a look. Undefined falls
       * back to the situation's standing list, so a dead model costs relevance, not the flow. */
      a.asked ? a.asked.map((x) => x.q) : undefined,
    ),
    [situations.join(','), assets.length, promote.length, auto.promote, shift.length, inputs, a.asked, readKeys.join(',')],
  )
  const asks = (q: string) => gaps.includes(q as never)
  /** The model's reason for asking this one, in the owner's own terms. Empty when it did not run. */
  const whyAsk = (q: string) => a.asked?.find((x) => x.q === q)?.why ?? ''

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

  /* The blank-page cure: real examples that write themselves into the sheet when tapped.
   * Editable the moment they land, so they are a running start, never a template. */
  const reduce = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const EXAMPLES = [
    'We are opening a second location in September and want a line out the door on day one.',
    'Tuesday and Wednesday nights are dead. I want those tables full.',
    'We are launching a new brunch menu next month and nobody knows about it yet.',
  ]
  const typeExample = (s: string) => {
    setReadBack(null); setReadErr(null)
    if (reduce) { setA((prev) => ({ ...prev, described: s, asked: undefined })); return }
    /* Paced by the clock, not the tick count, so browser timer throttling can slow the frames
     * but never the finish: the sentence is always fully on the sheet within about a second. */
    const t0 = Date.now()
    const iv = setInterval(() => {
      const n = Math.min(s.length, Math.round((Date.now() - t0) * 0.11))
      setA((prev) => ({ ...prev, described: s.slice(0, n), asked: undefined }))
      if (n >= s.length) clearInterval(iv)
    }, 40)
  }

  /*
   * ONE QUESTION PER SCREEN. Once the description is read, the hero collapses to a small quote
   * card and the follow-ups arrive one at a time: a plate, one question, its options, Next. The
   * list is still gapsFor's honest output — a good description keeps this short — plus the one
   * question every campaign gets: when it starts. Dated campaigns answer that with their date;
   * ongoing ones default to as-soon-as-possible.
   */
  type QStep = 'start' | 'money' | 'offer' | 'capacity' | 'target' | PlanQuestion
  const answered = situations.length > 0 || !!auto.goals
  const [editDesc, setEditDesc] = useState(false)
  const [qi, setQi] = useState(0)
  /* The money question comes LAST, on purpose: only once every other answer is in can the range
   * we show be the real one, and a number given here opens the plan already sized to it. The
   * default hands the sizing back to us — the plan is still built to the job, never to a wallet. */
  const [wantBudget, setWantBudget] = useState(() => initialAnswers?.budget != null)
  /* The facts disclosure: collapsed by default — it exists to catch wrong data, not to be read
   * on every walk. */
  const [showFacts, setShowFacts] = useState(false)
  /* The long promote list folds behind one row (design plan P2). Starts open when their menu is
   * empty (nothing else to pick from) or a read already picked from the folded groups. */
  const [morePromote, setMorePromote] = useState(
    () => menu.length === 0 || (a.promote ?? []).some((v) => PROMOTE_OTHER.some((g) => g.items.some((i) => i.v === v))),
  )
  /* The avoid question's free line, for the personal deal-breakers no chip covers. */
  const [avoidText, setAvoidText] = useState('')
  /* The start screen only shows when the paragraph did not already answer it: a read date (dated
   * shapes) or a read start (ongoing) is held, and the law is never to ask what is held. The
   * read-back chips below the recap are the correction path. Money ALWAYS shows — a read budget
   * prefills it, but sizing money to a paragraph without an explicit confirm tap is the one
   * shortcut the owner ruled out. */
  const startRead = wasRead('start') || (dated && wasRead('when'))
  /*
   * THE CONDITIONAL QUESTIONS (Ledger Phase 3), by the conditional-question law: they appear
   * only when this campaign's shape creates them, and never otherwise.
   *
   * Presence is judged on the PARAGRAPH and the shape, deliberately not on the answers the
   * screens themselves collect — a question that vanished the moment you typed into it would
   * yank the walk out from under the owner.
   *
   *   offer     the paragraph names a deal but the terms were not read out of it. Offer
   *             economics may never default (owner rule), so an offer-shaped campaign cannot
   *             pass this screen without terms.
   *   capacity  the shape creates a demand spike (offer-driven, or a dated/time-boxed moment):
   *             ask what limits the restaurant if it works. Awareness-only ongoing campaigns
   *             never see it.
   *   target    every campaign gets one: the number on the recipe's own proxy metric, suggested
   *             so the owner confirms rather than invents.
   */
  const offerSignal = offerApplies({ described: a.described }) || wasRead('offerTerms')
  const demandSpike = offerSignal || dated
  const needOffer = offerSignal && !wasRead('offerTerms')
  const qlist: QStep[] = answered
    ? [
        ...(startRead ? [] : ['start' as QStep]),
        ...gaps,
        ...(needOffer ? ['offer' as QStep] : []),
        ...(demandSpike ? ['capacity' as QStep] : []),
        'target' as QStep,
        'money' as QStep,
      ]
    : []
  const q: QStep | null = qlist.length ? qlist[Math.min(qi, qlist.length - 1)] : null
  const last = qi >= qlist.length - 1
  const showHero = !answered || editDesc
  const nextOk =
    q === 'start'
      ? (shape === 'date' ? !!a.when : shape === 'run' ? !!a.when : (a.start === 'asap' || (!!a.start && a.start !== '')))
      : q === 'promote'
        ? promote.length > 0 || !!auto.promote
        : q === 'money'
          ? (!wantBudget || (a.budget != null && a.budget > 0))
          : q === 'offer'
            /* Offer terms may never default (owner rule): an offer campaign cannot pass without them. */
            ? !!a.offerTerms?.trim()
            : q === 'capacity'
              ? !!a.capacity?.trim()
              : q === 'target'
                ? a.successTarget != null
                : true

  /* The target arrives pre-filled with the suggested number, so confirming it is one tap and
   * inventing one is never required. Suggested, not silent: the screen names the basis. */
  const targetSug = useMemo(
    () => suggestedTarget({ situations, described: a.described, offerTerms: a.offerTerms, offerLimit: a.offerLimit }),
    [situations.join(','), a.described, a.offerTerms, a.offerLimit],
  )
  useEffect(() => {
    if (q === 'target' && a.successTarget == null && targetSug) set({ successTarget: targetSug.value })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, targetSug?.value])

  /*
   * WHAT WE'RE WORKING FROM — the facts the plan quietly leans on, shown back once.
   *
   * The engine reads the account (rating, list, listing health) and onboarding (known for, who
   * you are for, slow days) and tilts the plan with all of it. Never showing that was the real
   * plan-quality risk: wrong account data composed a quietly wrong plan and the owner had no
   * moment to catch it. Stored goal and stored budget are deliberately NOT shown — this campaign's
   * goal came from the describe box, and old budget never sizes anything.
   */
  const facts = useMemo(() => {
    /* Each signal row carries its CONSEQUENCE, from the same file as the composer's rules — the
     * card states what the plan does about the fact, never just "go fix it yourself". */
    const FIX: Record<string, string | undefined> = { rating: '/dashboard/business-info', listing: '/dashboard/business-info' }
    const rows = signalNotes(signals).map((n) => ({ label: n.label, value: n.value, note: n.note as string | null, href: FIX[n.key] }))
    /* Onboarding facts steer the WORK (wording, featured dishes), not the mix — say that too. */
    const STEER: Record<string, string | null> = {
      knownFor: 'Your content and ads lead with these.',
      audience: 'Steers the wording and where things run.',
      slowDays: 'The slow-night work aims at these.',
      standsOut: null,
    }
    for (const r of knownIn(inputs)) {
      if (r.key === 'goal' || r.key === 'budget') continue
      rows.push({ label: r.label, value: r.value, note: STEER[r.key] ?? null, href: r.href })
    }
    return rows
  }, [inputs, signals])

  /*
   * THE SESSION VOICE — the walk reads as a strategist thinking with you, not a form.
   *
   * Each screen opens with a short line that ACKNOWLEDGES the previous answer before asking the
   * next thing, and the first screen sets the contract ("N quick answers, then we build").
   * Deterministic on purpose: composed from the answers already given, never a model call —
   * the conversation must not be able to stall, cost money, or invent things mid-walk.
   */
  const fmtDay = (iso?: string) => (iso ? new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { month: 'long', day: 'numeric' }) : '')
  const say = (() => {
    if (qi === 0) {
      const what = readBack?.summary ?? (picked[0] ? picked[0].label.toLowerCase().replace(/^we are /, 'so you are ') : null)
      const count = qlist.length
      /* Credit the paragraph for what it answered — the honest version of "this will be quick". */
      const took = readKeys.filter((k) => k !== 'situation' && k !== 'until').length
      const takeLine = took > 0 ? `You answered ${took === 1 ? 'one thing' : `${took} things`} in writing already. ` : ''
      return `${what ? what.replace(/\.?$/, '.') + ' ' : ''}${takeLine}We can build this — ${count} quick ${count === 1 ? 'answer' : 'answers'} first.`
    }
    const prev = qlist[qi - 1]
    switch (prev) {
      case 'start':
        return dated && a.when
          ? `${fmtDay(a.when)} it is. Everything works backwards from that day.`
          : a.start === 'asap'
            ? 'Starting the moment you approve. That keeps the momentum.'
            : a.start
              ? `Starting ${fmtDay(a.start)}. Noted.`
              : null
      case 'assets':
        return assets.length && !assets.includes('Nothing yet')
          ? 'Good. We build around what you already have, and you are never billed for it.'
          : 'Starting from scratch. No problem, the plan covers it.'
      case 'promote':
        return auto.promote
          ? 'We will pick from your menu. Next:'
          : promote.length
            ? `Leading with ${promote[0]}. Good choice.`
            : null
      case 'reach':
        return audience.length
          ? `Aimed at ${audience.slice(0, 2).join(' and ').toLowerCase()}. Got it.`
          : 'Keeping it local. Got it.'
      case 'shift':
        return shift.length ? `${shift.join(' and ')}. Those are the shifts we fix.` : null
      case 'avoid':
        return avoid.length ? 'Understood. That stays off the table, everywhere.' : 'Nothing off limits. Noted.'
      case 'offer':
        return a.offerTerms ? 'The deal goes out exactly as you wrote it.' : null
      case 'capacity':
        return a.capacity === 'Nothing limits us'
          ? 'Good — then we push as hard as the budget allows.'
          : a.capacity
            ? 'Noted. The team plans the push around that.'
            : null
      case 'target':
        return a.successTarget != null ? `${a.successTarget.toLocaleString('en-US')} it is. We track it from day one.` : null
      default:
        return null
    }
  })()

  /*
   * THE READ-BACK, itemized. One chip per field the paragraph supplied, in plain words. This is
   * the correction line the prefill rule depends on: prefilling is only honest while every
   * prefilled thing is visible and one tap from change.
   */
  const readChips = (() => {
    const chips: { key: string; text: string }[] = []
    if (wasRead('when') && a.when) chips.push({ key: 'when', text: fmtDay(a.when) + (a.until ? ` to ${fmtDay(a.until)}` : '') })
    if (wasRead('start') && a.start) chips.push({ key: 'start', text: a.start === 'asap' ? 'Starts right away' : `Starts ${fmtDay(a.start)}` })
    if (wasRead('budget') && a.budget != null) chips.push({ key: 'budget', text: `About $${a.budget.toLocaleString('en-US')}` })
    if (wasRead('reach')) chips.push({ key: 'reach', text: REACH.find((r) => r.v === reach)?.label ?? 'Reach' })
    if (wasRead('shift') && shift.length) chips.push({ key: 'shift', text: shift.join(', ') })
    if (wasRead('avoid') && avoid.length) chips.push({ key: 'avoid', text: `No ${avoid[0].toLowerCase()}${avoid.length > 1 ? ` +${avoid.length - 1}` : ''}` })
    if (wasRead('audience') && audience.length) chips.push({ key: 'audience', text: audience.slice(0, 2).join(', ') })
    if (wasRead('promote') && promote.length) chips.push({ key: 'promote', text: `Leading with ${promote[0]}` })
    if (wasRead('offerTerms') && a.offerTerms) chips.push({ key: 'offerTerms', text: a.offerTerms })
    return chips
  })()

  /**
   * A read was wrong: put its question back in the walk, with the read answer preselected so the
   * fix is one change rather than a restart. Values are kept where the reopened screen prefills
   * from them (date, reach, avoid, audience) and cleared where keeping them would stop the
   * question from reappearing (shift, promote — their screens subtract on a non-empty answer).
   */
  const reopenRead = (key: string) => {
    /* The offer has no question screen yet (Phase 3); its chip simply clears the read so the
     * campaign carries no offer the owner disowned. */
    if (key === 'offerTerms') {
      setA({ ...a, offerTerms: undefined, offerLimit: undefined, offerExpiry: undefined, readKeys: readKeys.filter((k) => !['offerTerms', 'offerLimit', 'offerExpiry'].includes(k)) })
      return
    }
    const q: QStep = key === 'when' || key === 'start' ? 'start' : key === 'budget' ? 'money' : key === 'audience' || key === 'reach' ? 'reach' : (key as QStep)
    /* audience and reach share a screen; reopening one reopens both honestly. */
    const drop = q === 'reach' ? ['reach', 'audience'] : [key]
    const rk = readKeys.filter((k) => !drop.includes(k))
    const patch: Partial<Answers> = { readKeys: rk }
    if (key === 'shift') patch.shift = []
    if (key === 'promote') patch.promote = []
    const asked = a.asked
    if ((q === 'reach' || q === 'shift' || q === 'avoid' || q === 'promote') && asked && !asked.some((x) => x.q === q)) {
      patch.asked = [...asked, { q, why: 'You asked to change this.' }]
    }
    setA({ ...a, ...patch })
    /* Land on the reopened question. Recompute the walk the same way qlist does, with the patch. */
    const pg = gapsFor(
      situations,
      {
        assets: assets.length > 0,
        promote: (patch.promote ?? promote).length > 0 || !!auto.promote || isKnown(inputs.knownFor),
        reach: rk.includes('reach'),
        shift: (patch.shift ?? shift).length > 0 || isKnown(inputs.slowDays),
        avoid: rk.includes('avoid'),
      },
      (patch.asked ?? asked)?.map((x) => x.q),
    )
    const sr = rk.includes('start') || (dated && rk.includes('when'))
    const list: QStep[] = [...(sr ? [] : ['start' as QStep]), ...pg, 'money']
    setQi(Math.max(0, list.indexOf(q)))
  }

  /* The honest range for the money question, from the same anchors the plan screen uses. */
  const moneyRange = useMemo(() => {
    if (q !== 'money') return null
    if (dated) {
      const A = datedAnchors(goals.length ? goals : undefined, reach, shift.length > 0, avoid, assets, undefined)
      return { lo: A.floor, hi: A.ceiling, per: 'all-in' as const }
    }
    const lo = monthlyFloor(goals.length ? goals : undefined, reach, shift.length > 0, undefined)
    const hi = budgetCeiling(goals.length ? goals : undefined, reach, shift.length > 0, undefined)
    return { lo, hi: hi ?? lo * 4, per: 'a month' as const }
  }, [q, dated, goals.join(','), reach, shift.length, avoid?.join(','), assets.join(',')])

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
    set({ situations: [m.situation.v], goals: [m.situation.goal], shape: m.situation.shape, readKeys: ['situation'] })
    return true
  }

  const describe = async () => {
    const text = (a.described ?? '').trim()
    if (text.length < 12 || reading) return
    setReading(true)
    setReadErr(null)
    try {
      const r = await fetch('/api/campaigns/describe', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        /* The menu rides along so the promote read can name their actual dishes. */
        body: JSON.stringify({ text, menu: inputs.menu.map((m) => m.name) }),
      })
      const j = (await r.json()) as { ok?: boolean; reason?: string; result?: Record<string, unknown> }
      if (!j.ok || !j.result) { fallbackRead(text); setReadErr(String(j.reason ?? 'upstream')); setReadBack(null); return }
      const res = j.result as {
        situation: string | null; shape?: string; when: string | null; until: string | null
        assets: string[]; summary: string; unsupported: string[]
        ask?: { q: PlanQuestion; why: string }[]
        read?: DescribeRead
      }
      setReadBack({ summary: res.summary, unsupported: res.unsupported ?? [] })
      const sit = res.situation ? situationByValue(res.situation) : undefined
      /* THE WIDE READ (Ledger Phase 2): everything else the paragraph answered, already through
       * the route's evidence law (a field only arrives quote-backed and vocabulary-checked).
       * Each one prefills its answer and joins readKeys, which drops its question from the walk.
       * Budget is the exception by owner rule: it prefills the money question but that screen
       * always shows for its explicit confirm tap. */
      const rd = (sit && res.read) || {}
      /* Provenance for the ledger: exactly the fields this read supplied, so the tier
       * classification (READ vs ASKED) is a record, never a guess. */
      const readKeys = [
        ...(sit ? ['situation'] : []),
        ...(res.when ? ['when'] : []),
        ...(res.until ? ['until'] : []),
        ...(res.assets?.length ? ['assets'] : []),
        ...Object.keys(rd),
      ]
      if (rd.budget != null) setWantBudget(true)
      set({
        ...(sit ? { situations: [sit.v], goals: [sit.goal], shape: sit.shape } : {}),
        ...(res.when ? { when: res.when } : {}),
        ...(res.until ? { until: res.until } : {}),
        ...(res.assets?.length ? { assets: res.assets } : {}),
        ...(rd.budget != null ? { budget: rd.budget } : {}),
        ...(rd.start ? { start: rd.start } : {}),
        ...(rd.reach ? { reach: rd.reach } : {}),
        ...(rd.shift ? { shift: rd.shift } : {}),
        ...(rd.avoid ? { avoid: rd.avoid } : {}),
        ...(rd.audience ? { audience: rd.audience } : {}),
        ...(rd.promote ? { promote: rd.promote } : {}),
        ...(rd.offerTerms ? { offerTerms: rd.offerTerms } : {}),
        ...(rd.offerLimit ? { offerLimit: rd.offerLimit } : {}),
        ...(rd.offerExpiry ? { offerExpiry: rd.offerExpiry } : {}),
        ...(readKeys.length ? { readKeys } : {}),
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
  /* The promote cap (design plan): one to three picks. The first pick is the lead. */
  const flip3 = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : arr.length >= 3 ? arr : [...arr, v])
  const setAuto = (k: 'goals' | 'promote' | 'audience', on: boolean) => set({ auto: { ...auto, [k]: on } })

  /* A description on its own is enough. If we could not parse it, a person reads it. */
  const goalsOk = auto.goals || situations.length > 0 || (a.described ?? '').trim().length >= 12
  const promoteOk = !gaps.includes('promote') || auto.promote || promote.length > 0
  /* A dated campaign without its date is not buildable: the whole schedule works backwards from it. */
  /* A dated campaign without its date is not buildable: the whole schedule works backwards from it.
   * "auto" means they handed the decision back, which resolves to an ongoing plan. */
  const shapeOk = auto.goals || (!!shape && (shape === 'ongoing' || !!a.when))
  const ready = shapeOk && goalsOk && promoteOk

  /* The desk's plan sheet: the plan visibly inking itself at the bottom as answers land. Solid
   * dots are answers we have; dashed ghosts are what is still open. Appears with the first
   * answer, like everything else on this screen. */
  const sheetLines: PlanSheetLine[] = []
  if (situations.length > 0 || auto.goals) {
    sheetLines.push({ text: auto.goals ? autoGoal : picked.map((p) => p.label).join(' + '), strong: true })
    if (dated) sheetLines.push(a.when
      ? { text: new Date(a.when + 'T12:00:00').toLocaleDateString(undefined, { month: 'long', day: 'numeric' }) + (shape === 'run' && a.until ? ` to ${new Date(a.until + 'T12:00:00').toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}` : '') }
      : { text: shape === 'run' ? 'The start date' : 'The date', ghost: true })
    else sheetLines.push(a.start && a.start !== 'asap'
      ? { text: `Starts ${new Date(a.start + 'T12:00:00').toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}` }
      : { text: 'Starts as soon as you approve' })
    if (assets.length > 0 && !assets.includes('Nothing yet')) sheetLines.push({ text: `Working with what you have: ${assets.slice(0, 2).join(', ').toLowerCase()}${assets.length > 2 ? '…' : ''}` })
    else if (asks('assets')) sheetLines.push({ text: 'What you bring', ghost: true })
    if (promote.length > 0 || auto.promote) sheetLines.push({ text: auto.promote ? 'Promoting: we pick from your menu' : `Promoting ${promote.slice(0, 2).join(', ')}${promote.length > 2 ? '…' : ''}` })
    else if (asks('promote')) sheetLines.push({ text: 'What to promote', ghost: true })
    if (asks('reach')) sheetLines.push({ text: `Reaching ${REACH.find((r) => r.v === reach)?.label.toLowerCase() ?? 'the neighbourhood'}` })
    if (avoid.length > 0) sheetLines.push({ text: `Never: ${avoid.slice(0, 2).join(', ').toLowerCase()}${avoid.length > 2 ? '…' : ''}` })
    if (a.offerTerms) sheetLines.push({ text: `The deal: ${a.offerTerms}${a.offerLimit ? ` (${a.offerLimit.toLowerCase()})` : ''}` })
    if (a.successTarget != null && targetSug) sheetLines.push({ text: `Aiming for ${a.successTarget.toLocaleString('en-US')} ${targetSug.metric}` })
    if (a.budget != null) sheetLines.push({ text: `Built to about $${a.budget.toLocaleString('en-US')}${dated ? '' : ' a month'}` })
  }

  return (
    <div style={{ background: '#F5F5F7', minHeight: '100%', padding: '18px 14px 0', fontFamily: "'Inter',system-ui,sans-serif", boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      <style>{CSS}</style>
      <DeskKeyframes />

      {/* 1 ── the situation, in their words. Shown until the read lands, and again on Edit; once
              answered it collapses to the quote card in the question walk below, so the owner is
              never scrolled past their own finished answer. */}
      {showHero && (
      <section style={{ marginBottom: 38, position: 'relative', paddingTop: 26 }}>
        <div className="ps-hero1" style={{ marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#86868B' }}>New campaign</span>
        </div>
        <h2 className="ps-hero2" style={{ fontFamily: DISPLAY, fontSize: 34, fontWeight: 700, color: '#1D1D1F', lineHeight: 1.07, margin: '0 0 10px', letterSpacing: '-0.03em' }}>
          Describe your campaign
        </h2>
        <p className="ps-hero2" style={{ fontSize: 15, color: '#6E6E73', lineHeight: 1.5, margin: '0 0 24px', maxWidth: '34ch', letterSpacing: '-0.01em' }}>
          Say it the way you would say it out loud. We work out the rest.
        </p>

        {/* The writing surface is the hero: a sheet of stationery laid on the desk. Faint ruled
            baselines under the words, a deep soft float, a mint glow when the pen touches it. */}
        <div className="ps-sheet ps-hero3" style={{ position: 'relative', padding: '18px 20px 16px' }}>
          <textarea
            className="ps-say"
            value={a.described ?? ''}
            onChange={(e) => { set({ described: e.target.value, asked: undefined }); setReadBack(null); setReadErr(null) }}
            placeholder="I want to do a fundraiser night where part of every check goes to the local food bank."
            rows={4}
            style={{
              width: '100%', border: 'none', outline: 'none', resize: 'none', background: 'transparent',
              padding: 0, margin: 0, display: 'block',
              fontFamily: "'Inter',system-ui,sans-serif", fontSize: 19, lineHeight: '34px',
              letterSpacing: '-0.011em', color: DESK.ink, minHeight: 136,
            }}
          />
        </div>

        {/* Three real briefs that type themselves onto the sheet. Gone the moment there is a word
            on it: a running start, never a template. */}
        {(a.described ?? '').trim().length === 0 && situations.length === 0 && (
          <div className="ps-hero4" style={{ marginTop: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#86868B', marginBottom: 9 }}>Try one of these</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {EXAMPLES.map((s) => (
                <button
                  key={s} type="button" className="ps-chip" onClick={() => typeExample(s)}
                  style={{
                    textAlign: 'left', cursor: 'pointer',
                    border: '0.5px solid rgba(0,0,0,0.08)', background: '#FFFFFF',
                    borderRadius: 14, padding: '12px 15px', fontFamily: "'Inter',system-ui,sans-serif",
                    boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                  }}
                >
                  <span style={{ fontSize: 13.5, color: '#1D1D1F', lineHeight: 1.45, letterSpacing: '-0.01em' }}>{s.replace(/\.$/, '')}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Full width, and quiet until there is something to send. The old control was a 34px pill
            tucked in a footer beside a caption, which made the one action on the screen the
            smallest thing on it. */}
        <button
          type="button" className="ps-go" onClick={async () => { await describe(); setEditDesc(false); setQi(0) }}
          disabled={reading || (a.described ?? '').trim().length < 12}
          style={{
            width: '100%', height: 50, marginTop: 16, borderRadius: 25, border: 'none',
            cursor: (a.described ?? '').trim().length < 12 ? 'default' : 'pointer',
            background: (a.described ?? '').trim().length < 12 ? '#E8E8ED' : DESK.mint,
            color: (a.described ?? '').trim().length < 12 ? '#AEAEB2' : '#fff',
            fontFamily: "'Inter',system-ui,sans-serif", fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em',
          }}
        >
          {reading ? 'Reading…' : 'Continue'}
        </button>

        <div style={{ fontSize: 12, color: '#86868B', textAlign: 'center', marginTop: 12, lineHeight: 1.45 }}>
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

        {/* Held back until there is something written. On an empty screen a dashed "Decide for me"
            card is a second, competing offer next to the only thing we want them to do, and it is
            answering a question they have not been asked yet. */}
        {((a.described ?? '').trim().length > 0 || situations.length > 0 || !!auto.goals) && (
          <DecideForMe on={!!auto.goals} resolves={autoGoal} onToggle={() => { setAuto('goals', !auto.goals); if (!auto.goals) set({ situations: [], goals: [], shape: undefined, auto: { ...auto, goals: true } }) }} />
        )}
      </section>
      )}

      {/* ── the question walk: what you said, collapsed, then one question at a time ── */}
      {!showHero && q && (
      <section style={{ marginBottom: 26 }}>
        {/* What they wrote, folded to a quote card. Tap to reopen the sheet and change it. */}
        <button
          type="button" onClick={() => setEditDesc(true)}
          style={{
            width: '100%', textAlign: 'left', cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'flex-start',
            background: '#fff', border: `1px solid ${DESK.line}`, borderRadius: 14, padding: '11px 13px',
            marginBottom: 22, fontFamily: "'Inter',system-ui,sans-serif", boxShadow: '0 1px 3px rgba(22,33,28,0.05)',
          }}
        >
          <span aria-hidden style={{ color: DESK.mintDeep, fontFamily: DISPLAY, fontWeight: 700, fontSize: 16, lineHeight: '18px' }}>&ldquo;</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
              fontSize: 13, color: DESK.ink, lineHeight: 1.45,
            }}>{auto.goals && !(a.described ?? '').trim() ? autoGoal : (a.described ?? '').trim()}</span>
            {readBack?.unsupported && readBack.unsupported.length > 0 && (
              <span style={{ display: 'block', fontSize: 11.5, color: AMBER_DK, marginTop: 4, lineHeight: 1.4 }}>
                We do not do {readBack.unsupported.join(', ')}. The rest we can.
              </span>
            )}
          </span>
          <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 700, color: DESK.mintDeep, marginTop: 1 }}>Edit</span>
        </button>

        {/* WHAT THE PARAGRAPH ANSWERED (Ledger Tier 2), each with its way back. These questions
            were dropped from the walk because the owner already answered them in writing — the
            law is never to ask what is held. But a read can be wrong, so every taken field is a
            chip; tapping one reopens that question with the read answer preselected. */}
        {qi === 0 && readChips.length > 0 && (
          <div style={{ margin: '-12px 0 22px' }}>
            <div style={{ fontSize: 12, color: '#86868B', marginBottom: 7 }}>From what you wrote we took — tap to change:</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {readChips.map((c) => (
                <button
                  key={c.key} type="button" onClick={() => reopenRead(c.key)} className="ps-pick"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer',
                    background: '#fff', border: `1px solid ${DESK.line}`, borderRadius: 99, padding: '6px 11px',
                    fontFamily: "'Inter',system-ui,sans-serif", fontSize: 12, fontWeight: 600, color: DESK.ink,
                  }}
                >
                  <Check size={11} strokeWidth={2.8} color={C.green} />
                  {c.text}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Shown once, on the first stop: the facts the plan will lean on, each with its door to
            fix it. An owner who spots "4.1★" or a wrong slow day here just saved the whole plan. */}
        {/* One quiet line, not a wall: the facts the plan leans on stay a tap away. The detail
            exists to catch wrong account data, not to be read every single time. */}
        {qi === 0 && facts.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <button
              type="button" onClick={() => setShowFacts(!showFacts)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: "'Inter',system-ui,sans-serif" }}
            >
              <span style={{ fontSize: 12.5, color: '#86868B' }}>Built from what we already know about you</span>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: DESK.mintDeep }}>{showFacts ? 'Hide' : 'Show'}</span>
            </button>
            {showFacts && (
              <div style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.08)', borderRadius: 16, padding: '2px 15px', marginTop: 10, boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
                {facts.map((f, i) => (
                  <div key={f.label} style={{ padding: '9px 0 10px', borderTop: i > 0 ? '0.5px solid rgba(0,0,0,0.06)' : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                      <span style={{ fontSize: 13, color: '#6E6E73', flexShrink: 0 }}>{f.label}</span>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: '#1D1D1F', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.value}</span>
                      {f.href && (
                        <a href={f.href} style={{ flexShrink: 0, fontSize: 12.5, fontWeight: 600, color: DESK.mintDeep, textDecoration: 'none' }}>Fix</a>
                      )}
                    </div>
                    {f.note && (
                      <div style={{ fontSize: 12, color: '#86868B', lineHeight: 1.45, marginTop: 3 }}>{f.note}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div key={q} className="ps-hero2">
        {/* The strategist speaks first: acknowledge what was just said, then ask the next thing. */}
        {say && (
          <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', marginBottom: 18 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill={DESK.mintDeep} aria-hidden style={{ flexShrink: 0, marginTop: 3 }}>
              <path d="M12 2l1.6 5.4L19 9l-5.4 1.6L12 16l-1.6-5.4L5 9l5.4-1.6z" />
            </svg>
            <span style={{ fontSize: 15, color: '#1D1D1F', lineHeight: 1.5, letterSpacing: '-0.01em' }}>{say}</span>
          </div>
        )}
        {/* start ── every campaign gets the clock question. Dated campaigns answer it with their
            date; ongoing ones default honestly to as-soon-as-possible. */}
        {q === 'start' && (
          <Act n={qi + 2} of={1 + qlist.length}
            title={shape === 'date' ? (picked[0]?.v === 'opening' ? WT['date.opening'] : WT['date.event']) : shape === 'run' ? WT['date.run'] : WT.start}
            sub={shape === 'date' ? WS.date : shape === 'run' ? WS['date.run'] : WS.start}
          >
            {shape === 'date' ? (
              /* A day whose quality is visible before the tap: tints from the goal's real
               * turnarounds. Picking here makes the date THEIR answer (provenance read -> asked). */
              <WalkCalendar
                goal={picked[0]?.goal ?? goals[0] ?? 'more-new'}
                value={a.when}
                onChange={(day) => set({ when: day, readKeys: readKeys.filter((k) => k !== 'when'), touched: [...new Set([...(a.touched ?? []), 'start'])] })}
              />
            ) : shape === 'run' ? (
              <>
                <div style={{ display: 'flex', gap: 9 }}>
                  <input aria-label="Starts" type="date" value={a.when ?? ''} onChange={(e) => set({ when: e.target.value })}
                    style={{ flex: 1, minWidth: 0, height: 48, border: `1.5px solid ${DESK.line}`, borderRadius: 13, padding: '0 10px', fontSize: 15, color: C.ink, fontFamily: "'Inter',system-ui,sans-serif", background: '#fff' }} />
                  <input aria-label="Ends" type="date" value={a.until ?? ''} onChange={(e) => set({ until: e.target.value })}
                    style={{ flex: 1, minWidth: 0, height: 48, border: `1.5px solid ${DESK.line}`, borderRadius: 13, padding: '0 10px', fontSize: 15, color: C.ink, fontFamily: "'Inter',system-ui,sans-serif", background: '#fff' }} />
                </div>
                <div style={{ fontSize: 11.5, color: AMBER_DK, background: AMBER_SOFT, borderRadius: 9, padding: '8px 10px', marginTop: 9, lineHeight: 1.45 }}>
                  {WL['run.note']}
                </div>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                  <Card on={a.start === 'asap'} label={WL['start.asap.label']} sub={WL['start.asap.sub']} badge="Recommended" onClick={() => set({ start: 'asap', touched: [...new Set([...(a.touched ?? []), 'start'])] })} />
                  <Card on={a.start !== 'asap'} label={WL['start.date.label']} sub={WL['start.date.sub']} onClick={() => set({ start: a.start === 'asap' ? '' : a.start, touched: [...new Set([...(a.touched ?? []), 'start'])] })} />
                </div>
                {a.start !== 'asap' && (
                  <div style={{ marginTop: 9 }}>
                    <WalkCalendar
                      goal={goals[0] ?? 'more-new'}
                      value={a.start && a.start !== 'asap' ? a.start : undefined}
                      onChange={(day) => set({ start: day, touched: [...new Set([...(a.touched ?? []), 'start'])] })}
                    />
                  </div>
                )}
              </>
            )}
          </Act>
        )}

        {/* money ── asked LAST and optional, so the range shown is the real one and a given
            number opens the plan already sized to it. The default hands sizing back to us. */}
        {q === 'money' && (
          <Act
            n={qi + 2} of={1 + qlist.length}
            title={wasRead('budget') ? WT['money.confirm'] : WT.money}
            sub={wasRead('budget') && a.budget != null
              /* Money never moves on a read alone (owner rule): the number from the paragraph
               * lands here prefilled, and the Next tap below IS the explicit confirmation. */
              ? fill(WS['money.confirm'], { amount: '$' + a.budget.toLocaleString('en-US') })
              : WS.money}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              <Card on={!wantBudget} label={WL['money.auto.label']} sub={WL['money.auto.sub']} badge={wasRead('budget') ? undefined : 'Recommended'} onClick={() => { setWantBudget(false); set({ budget: undefined, readKeys: readKeys.filter((k) => k !== 'budget') }) }} />
              <Card on={wantBudget} label={WL['money.num.label']} sub={dated ? WL['money.num.sub.dated'] : WL['money.num.sub.monthly']} onClick={() => setWantBudget(true)} />
            </div>
            {wantBudget && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 10, border: `1.5px solid ${DESK.line}`, borderRadius: 13, background: '#fff', padding: '0 14px', height: 50 }}>
                  <span style={{ fontFamily: DISPLAY, fontSize: 18, color: C.mute }}>$</span>
                  <input
                    inputMode="numeric" aria-label="Your budget" autoFocus
                    value={a.budget != null ? a.budget.toLocaleString('en-US') : ''}
                    onChange={(e) => {
                      const n = e.target.value.replace(/[^0-9]/g, '')
                      /* Typing a different number makes it THEIR answer: provenance flips read → asked. */
                      set({ budget: n ? Number(n) : undefined, readKeys: readKeys.filter((k) => k !== 'budget') })
                    }}
                    placeholder={moneyRange ? Math.round((moneyRange.lo + moneyRange.hi) / 2).toLocaleString('en-US') : '1,000'}
                    style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontFamily: DISPLAY, fontSize: 18, color: C.ink }}
                  />
                  <span style={{ fontSize: 12.5, color: C.mute, whiteSpace: 'nowrap' }}>{dated ? 'for the launch' : 'a month'}</span>
                </div>
                {moneyRange && (
                  <div style={{ fontSize: 12, color: C.mute, lineHeight: 1.5, marginTop: 8 }}>
                    Campaigns like this run ${moneyRange.lo.toLocaleString('en-US')} to ${moneyRange.hi.toLocaleString('en-US')} {moneyRange.per === 'all-in' ? 'all-in' : 'a month'}.
                    We build to your number and show what a little more would add.
                  </div>
                )}
              </>
            )}
          </Act>
        )}

        {/* offer ── only for offer-shaped campaigns whose terms were not read. Terms may never
            default (owner rule): the walk cannot pass this screen without them. */}
        {q === 'offer' && (
          <Act n={qi + 2} of={1 + qlist.length} title={WT.offer} sub={WS.offer}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {([
                { k: 'offerTerms' as const, label: 'The offer', ph: '20% off all sandwiches', req: true },
                { k: 'offerLimit' as const, label: 'Any limit', ph: 'First 100 customers, one per table…', req: false },
                { k: 'offerExpiry' as const, label: 'When it ends', ph: 'Opening week, end of August…', req: false },
              ]).map((f) => (
                <div key={f.k}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.mute, marginBottom: 5 }}>
                    {f.label}{f.req ? '' : '  ·  optional'}
                  </div>
                  <input
                    value={a[f.k] ?? ''} placeholder={f.ph} aria-label={f.label}
                    onChange={(e) => set({ [f.k]: e.target.value || undefined, readKeys: readKeys.filter((k) => k !== f.k) })}
                    style={{
                      width: '100%', boxSizing: 'border-box', height: 46, padding: '0 13px',
                      border: `1.5px solid ${DESK.line}`, borderRadius: 13, background: '#fff', outline: 'none',
                      fontFamily: "'Inter',system-ui,sans-serif", fontSize: 14, color: C.ink,
                    }}
                  />
                </div>
              ))}
            </div>
          </Act>
        )}

        {/* capacity ── demand-spike shapes only: what limits the restaurant if it works. This is
            the room's capacity to absorb the spike, and it goes to the team verbatim. */}
        {q === 'capacity' && (
          <Act n={qi + 2} of={1 + qlist.length} title={WT.capacity} sub={WS.capacity}>
            {(() => {
              /* Two clean parts, stored as the one string the brief already carries. The chips and
               * the who-line parse back out of the stored string, so the screen round-trips. */
              const cap = a.capacity ?? ''
              const picked = CAPACITY_CHIPS.filter((c) => cap.includes(c))
              const who = (cap.match(/Staff briefed by: (.+?)\.?$/) ?? [])[1] ?? ''
              const compose = (chips: string[], w: string) =>
                [...chips, w.trim() ? `Staff briefed by: ${w.trim()}` : ''].filter(Boolean).join('. ') || undefined
              const toggle = (c: string) => {
                const next = c === 'Nothing limits us'
                  ? (picked.includes(c) ? [] : ['Nothing limits us'])
                  : (picked.includes(c) ? picked.filter((x) => x !== c) : [...picked.filter((x) => x !== 'Nothing limits us'), c])
                set({ capacity: compose(next, who) })
              }
              return (
                <>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 12 }}>
                    {CAPACITY_CHIPS.map((c) => {
                      const on = picked.includes(c)
                      return (
                        <button
                          key={c} type="button" className="ps-pick" onClick={() => toggle(c)}
                          style={{
                            cursor: 'pointer', background: on ? '#f0faf6' : '#fff',
                            border: `1.5px solid ${on ? C.green : DESK.line}`, borderRadius: 99,
                            padding: '8px 13px', fontFamily: "'Inter',system-ui,sans-serif",
                            fontSize: 12.5, fontWeight: 600, color: on ? C.greenDk : C.ink,
                          }}
                        >
                          {c}
                        </button>
                      )
                    })}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.mute, marginBottom: 5 }}>{WL['capacity.who']}</div>
                  <input
                    value={who} aria-label={WL['capacity.who']}
                    onChange={(e) => set({ capacity: compose(picked, e.target.value) })}
                    placeholder={WL['capacity.who.ph']}
                    style={{
                      width: '100%', boxSizing: 'border-box', height: 46, padding: '0 13px',
                      border: `1.5px solid ${DESK.line}`, borderRadius: 13, background: '#fff', outline: 'none',
                      fontFamily: "'Inter',system-ui,sans-serif", fontSize: 14, color: C.ink,
                    }}
                  />
                </>
              )
            })()}
          </Act>
        )}

        {/* target ── every campaign gets one number to hit, on the metric its recipe already
            tracks. Suggested so the owner confirms rather than invents; never revenue. */}
        {q === 'target' && targetSug && (
          <Act n={qi + 2} of={1 + qlist.length} title={WT.target} sub={fill(WS.target, { metric: targetSug.metric })}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, border: `1.5px solid ${DESK.line}`, borderRadius: 13, background: '#fff', padding: '0 14px', height: 50 }}>
              <input
                inputMode="numeric" aria-label="Success target"
                value={a.successTarget != null ? a.successTarget.toLocaleString('en-US') : ''}
                onChange={(e) => { const n = e.target.value.replace(/[^0-9]/g, ''); set({ successTarget: n ? Number(n) : undefined }) }}
                style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontFamily: DISPLAY, fontSize: 18, color: C.ink }}
              />
              <span style={{ fontSize: 12.5, color: C.mute, whiteSpace: 'nowrap' }}>{targetSug.metric}</span>
            </div>
            <div style={{ fontSize: 12, color: C.mute, lineHeight: 1.5, marginTop: 8 }}>
              We suggested {targetSug.value.toLocaleString('en-US')} — {targetSug.basis}. Change it if you know your number.
            </div>
          </Act>
        )}

        {/* shift ── which shifts, its own screen when they said shifts are the problem. */}
        {q === 'shift' && (
          <Act n={qi + 2} of={1 + qlist.length} title={WT.shift} sub={whyAsk('shift') || WS.shift}>
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
          </Act>
        )}

        {q === 'assets' && <Act n={qi + 2} of={1 + qlist.length} title={WT.assets} sub={whyAsk('assets') || WS.assets}>
        <Grid>
          {OWNER_ASSETS.filter((o) => o.v !== 'Nothing yet').map((o) => {
            const on = assets.includes(o.v)
            /* The payoff swaps in on selection: honesty reads as visible money and strength. */
            const line = on ? (ASSET_PAYOFF[o.v] ?? o.sub) : o.sub
            return (
              <button
                key={o.v} type="button" className="ps-pick"
                onClick={() => set({ assets: flip(assets.filter((x) => x !== 'Nothing yet'), o.v) })}
                style={{
                  textAlign: 'left', cursor: 'pointer', border: `1.5px solid ${on ? C.green : C.line}`,
                  background: on ? '#f0faf6' : '#fff', borderRadius: 14, padding: '11px 12px',
                  fontFamily: "'Inter',system-ui,sans-serif",
                }}
              >
                <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: on ? C.green : C.ink }}>{o.label}</span>
                <span style={{ display: 'block', fontSize: 11, color: on ? C.greenDk : C.mute, marginTop: 2, lineHeight: 1.35, fontWeight: on ? 600 : 400 }}>{line}</span>
              </button>
            )
          })}
        </Grid>
        <button
          type="button"
          onClick={() => set({ assets: assets.includes('Nothing yet') ? [] : ['Nothing yet'] })}
          style={{ display: 'block', margin: '12px auto 0', background: 'none', border: 'none', padding: 4, cursor: 'pointer', fontSize: 12.5, fontWeight: assets.includes('Nothing yet') ? 700 : 600, color: assets.includes('Nothing yet') ? DESK.mintDeep : C.faint, fontFamily: "'Inter',system-ui,sans-serif" }}
        >
          {assets.includes('Nothing yet') ? 'Nothing yet. We cover it all.' : WL['assets.none']}
        </button>
        {covered.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginTop: 11, padding: '10px 12px', background: '#f0faf6', borderRadius: 12, fontSize: 12.5, color: C.ink, lineHeight: 1.45 }}>
            <Check size={14} strokeWidth={2.6} color={C.green} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>Because you have your own, we will not charge you for {covered.length === 1 ? 'a shoot' : 'photography'}. It still shows on the plan, at zero.</span>
          </div>
        )}
      </Act>}

      {/* 3 ── what to promote */}
        {q === 'promote' && <Act n={qi + 2} of={1 + qlist.length} title={WT.promote} sub={whyAsk('promote') || WS.promote}>
        {menu.length > 0 && (
          <>
            <GroupLabel>From your menu</GroupLabel>
            <Grid>
              {menu.map((m) => (
                <Card key={m.id} on={promote.includes(m.name)} label={m.name} badge={m.featured ? 'You featured this' : undefined}
                  dim={auto.promote} onClick={() => set({ promote: flip3(promote, m.name), auto: { ...auto, promote: false } })} />
              ))}
            </Grid>
          </>
        )}
        {morePromote ? (
          PROMOTE_OTHER.map((g) => (
            <div key={g.group}>
              <GroupLabel>{g.group}</GroupLabel>
              <Grid>
                {g.items.map((o) => (
                  <Card key={o.v} on={promote.includes(o.v)} label={o.label} sub={o.sub}
                    dim={auto.promote} onClick={() => set({ promote: flip3(promote, o.v), auto: { ...auto, promote: false } })} />
                ))}
              </Grid>
            </div>
          ))
        ) : (
          <button
            type="button" onClick={() => setMorePromote(true)}
            style={{ width: '100%', marginTop: 10, background: '#fff', border: `1.5px dashed ${C.line}`, borderRadius: 14, padding: '11px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: C.mute, fontFamily: "'Inter',system-ui,sans-serif" }}
          >
            More to show: the bar, the patio, happy hour, the story…
          </button>
        )}
        {promote.length > 0 && !auto.promote && (
          <div style={{ fontSize: 12.5, color: C.ink, marginTop: 11 }}>
            {WL['restate.promote']}: <b style={{ color: DESK.mintDeep }}>{promote[0]}</b>
            {promote.length > 1 && <span style={{ color: C.mute }}> · also {promote.slice(1).join(', ')}</span>}
          </div>
        )}
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
        {q === 'reach' && <Act n={qi + 2} of={1 + qlist.length} title={WT.reach} sub={whyAsk('reach') || WS.reach}>
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
            <Card key={r.v} on={reach === r.v} label={r.label} sub={r.sub} onClick={() => set({ reach: r.v, touched: [...new Set([...(a.touched ?? []), 'reach'])] })} />
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
        {q === 'avoid' && <Act n={qi + 2} of={1 + qlist.length} title={WT.avoid} sub={whyAsk('avoid') || WS.avoid}>
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
        {avoid.filter((v) => !AVOID.some((o) => o.v === v)).length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 10 }}>
            {avoid.filter((v) => !AVOID.some((o) => o.v === v)).map((v) => (
              <button key={v} type="button" onClick={() => set({ avoid: avoid.filter((x) => x !== v) })}
                style={{ cursor: 'pointer', background: '#fdeeee', border: '1.5px solid #c0564f', borderRadius: 99, padding: '7px 12px', fontSize: 12, fontWeight: 600, color: '#c0564f', fontFamily: "'Inter',system-ui,sans-serif" }}>
                {v} ×
              </button>
            ))}
          </div>
        )}
        <input
          value={avoidText} aria-label="Anything else to avoid"
          onChange={(e) => setAvoidText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && avoidText.trim()) { set({ avoid: [...avoid, avoidText.trim()] }); setAvoidText('') } }}
          onBlur={() => { if (avoidText.trim()) { set({ avoid: [...avoid, avoidText.trim()] }); setAvoidText('') } }}
          placeholder="Anything else we should never do? Type it and press enter."
          style={{ width: '100%', boxSizing: 'border-box', height: 44, marginTop: 10, padding: '0 13px', border: `1.5px solid ${C.line}`, borderRadius: 13, background: '#fff', outline: 'none', fontFamily: "'Inter',system-ui,sans-serif", fontSize: 13, color: C.ink }}
        />
        {avoid.length > 0 && (
          <div style={{ fontSize: 12.5, color: C.ink, marginTop: 10 }}>
            {WL['restate.avoid']}: <b style={{ color: '#c0564f' }}>{avoid.map((v) => v.toLowerCase()).join(', ')}.</b>
          </div>
        )}
      </Act>}

        {/* The last stop also carries the optional extras, so they are seen exactly once. */}
        {last && connect.length > 0 && (
          <div style={{ marginBottom: 4 }}>
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
          </div>
        )}
        {last && (
          <div style={{ marginBottom: 8 }}>
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
          </div>
        )}
        </div>

        {/* One step back, one step forward. The forward button is the only loud thing here. */}
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button
            type="button" className="ps-go"
            onClick={() => (qi === 0 ? setEditDesc(true) : setQi(qi - 1))}
            style={{
              flexShrink: 0, height: 50, padding: '0 18px', borderRadius: 25, cursor: 'pointer',
              border: `1.5px solid ${DESK.line}`, background: '#fff', color: DESK.ink2,
              fontFamily: "'Inter',system-ui,sans-serif", fontSize: 14.5, fontWeight: 600,
            }}
          >
            Back
          </button>
          <button
            type="button" className="ps-go"
            disabled={!nextOk || (last && !ready)}
            onClick={() => (last ? onBuild({ ...a, shape, situations, goals, shift, assets, promote, audience, reach, avoid }) : setQi(qi + 1))}
            style={{
              flex: 1, height: 50, borderRadius: 25, border: 'none',
              cursor: nextOk && (!last || ready) ? 'pointer' : 'default',
              background: nextOk && (!last || ready) ? DESK.grad : '#DDD9CE', color: '#fff',
              boxShadow: nextOk && (!last || ready) ? '0 10px 26px rgba(46,154,120,0.32)' : 'none',
              fontFamily: "'Inter',system-ui,sans-serif", fontSize: 16, fontWeight: 650, letterSpacing: '-0.01em',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            {last ? 'Build my plan' : 'Next'}
            <ArrowRight size={17} />
          </button>
        </div>
        {last && (
          <div style={{ fontSize: 11.5, color: C.faint, lineHeight: 1.5, padding: '13px 4px 4px', textAlign: 'center' }}>
            You pick when each piece goes out after the plan is built, not now.
          </div>
        )}
      </section>
      )}

      {/* The plan sheet rides the bottom edge while there are answers to show, growing a line at a
          time. Bleeds to the screen edge so it reads as a sheet sliding up, not another card. */}
      {sheetLines.length > 0 ? (
        <div style={{ position: 'sticky', bottom: 0, margin: '0 -14px 0', zIndex: 3 }}>
          <PlanSheet title="Your plan so far" lines={sheetLines} />
        </div>
      ) : (
        <div style={{ height: 28 }} />
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
