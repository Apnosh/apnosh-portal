'use client'

/**
 * Create a monthly marketing plan — the first thing an owner runs.
 *
 *   1 SETUP  show everything we already know (onboarding, live connections, the real menu) and ask
 *            ONLY the genuine gaps. See plan-setup.tsx for why this is not a wizard.
 *   2 BUILD  one plan for the whole funnel, fitted to the budget, handed over as something to work
 *            in: take things out, add things back, watch the money and the chain move.
 *
 * NOTE (debt, deliberate): this is structurally the same flow as slow-nights-flow.tsx — ask, then a
 * chain you can edit. They differ only in the questions, the steps and the composer. They are kept
 * apart while the shape is still moving; once it settles they should collapse into one flow that
 * takes a composer, rather than being copied a third time.
 */

import { useMemo, useState } from 'react'
import { ChevronLeft, Check, Clock, Plus, Minus, TrendingUp, Inbox, BarChart3, Hammer } from 'lucide-react'
import { C, DISPLAY, AMBER_DK, AMBER_SOFT } from '@/components/mvp/mvp-detail'
import { DESK, DeskKeyframes, ReceiptFrame, ReceiptRule, ConfirmButton, paperGround } from '@/components/campaigns/desk/ui'
import {
  MONTHLY_STEPS,
  composeMonthlyPlan,
  monthlyBill,
  recommendedMonthly,
  monthlyFloor,
  budgetCeiling,
  datedAnchors,
  addablesForStep,
  toCampaignDraft,
  type MonthlyLine,
  type MonthlyStepKey,
} from '@/lib/campaigns/data/monthly-plan'
import type { MonthlySignals } from '@/lib/campaigns/data/monthly-signals'
import { startMonthlyPlan } from '@/lib/dashboard/get-plan-inputs'
import { CLIENT_AGREEMENT_VERSION, CLIENT_AGREEMENT_SUMMARY } from '@/lib/agreements/client-agreement'
import { buildOrderSnapshot } from '@/lib/agreements/order-snapshot'
import { ChainRung, chainStateOf, chainVerdict } from '@/components/campaigns/slow-nights/slow-nights-chain'
import { assetsCover, type PlanQuestion } from '@/lib/campaigns/data/plan-goals'
import { ledgerFor } from '@/lib/campaigns/data/campaign-ledger'
import PlanSetup, { type Answers } from './plan-setup'

const MP_CSS = `
.mp-slider { -webkit-appearance:none; appearance:none; width:100%; height:34px; background:transparent; cursor:grab; }
.mp-slider:active { cursor:grabbing; }
.mp-slider::-webkit-slider-runnable-track { height:6px; border-radius:99px; background:var(--mp-track); }
.mp-slider::-moz-range-track { height:6px; border-radius:99px; background:var(--mp-track); }
.mp-slider::-webkit-slider-thumb { -webkit-appearance:none; appearance:none; width:30px; height:30px; margin-top:-12px;
  border-radius:99px; background:#fff; border:2px solid #4abd98; box-shadow:0 1px 5px rgba(0,0,0,.16); }
.mp-slider::-moz-range-thumb { width:30px; height:30px; border-radius:99px; background:#fff;
  border:2px solid #4abd98; box-shadow:0 1px 5px rgba(0,0,0,.16); }
`

/** Dial stops for the money card on the plan. Uneven on purpose: the real decisions live low. */
const DIAL_STOPS = [150, 250, 400, 600, 800, 1100, 1500, 2000, 3000, 4000, 6000, 8000, 10000]
import type { PlanInputs } from '@/lib/campaigns/data/plan-inputs'

const usd = (n: number) => '$' + n.toLocaleString('en-US')

const priceLabel = (l: MonthlyLine) =>
  l.kind === 'monthly' ? usd(l.amount) + ' a month' : l.kind === 'per-unit' ? usd(l.amount) + ' each' : usd(l.amount)

/* ─────────────────────────────────────────────────────────────────────────── shared bits ── */

function Q({ n, of, title, sub, children }: { n: number; of: number; title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 26 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', color: C.faint, marginBottom: 6 }}>
        {n} OF {of}
      </div>
      <div style={{ fontFamily: DISPLAY, fontSize: 19, fontWeight: 600, color: C.ink, lineHeight: 1.2 }}>{title}</div>
      {sub && <div style={{ fontSize: 12.5, color: C.mute, marginTop: 4, lineHeight: 1.45 }}>{sub}</div>}
      <div style={{ marginTop: 12 }}>{children}</div>
    </div>
  )
}

function Chip({ on, label, sub, onClick }: { on: boolean; label: string; sub?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: '1 1 46%',
        textAlign: 'left',
        border: `1px solid ${on ? C.green : C.line}`,
        background: on ? C.greenSoft : '#fff',
        borderRadius: 13,
        padding: '11px 13px',
        cursor: 'pointer',
        font: 'inherit',
        fontFamily: "'Inter',system-ui,sans-serif",
      }}
    >
      <span style={{ display: 'block', fontSize: 14, fontWeight: on ? 700 : 600, color: on ? C.greenDk : C.ink }}>
        {label}
      </span>
      {sub && <span style={{ display: 'block', fontSize: 11.5, color: C.mute, marginTop: 2 }}>{sub}</span>}
    </button>
  )
}

function Back({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none',
        padding: '0 0 14px', color: C.greenDk, fontSize: 14.5, fontWeight: 600, cursor: 'pointer', font: 'inherit',
      }}
    >
      <ChevronLeft size={17} />
      {label}
    </button>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: C.faint, padding: '14px 4px 8px' }}>
      {children}
    </div>
  )
}

function ServiceCard({ line, action, onToggle }: { line: MonthlyLine; action: 'remove' | 'add' | null; onToggle?: () => void }) {
  const muted = !!line.held || !!line.have
  return (
    <div
      style={{
        position: 'relative', overflow: 'hidden',
        background: '#fff',
        border: `${line.extra ? 1.5 : 1}px solid ${line.extra ? DESK.mint : DESK.line}`,
        borderRadius: 14, padding: '14px 14px 13px 22px', marginBottom: 10,
        display: 'flex', gap: 12, alignItems: 'flex-start',
        boxShadow: '0 1px 3px rgba(22,33,28,0.04)',
      }}
    >
      {/* The ticket's perforated stub edge. */}
      <span aria-hidden style={{ position: 'absolute', left: 9, top: 6, bottom: 6, borderLeft: `2px dashed ${line.extra ? DESK.mintLine : DESK.line}` }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, marginBottom: 6 }}>
          <span style={{ flex: 1, fontFamily: DISPLAY, fontSize: 15.5, fontWeight: 600, color: muted ? C.mute : C.ink, lineHeight: 1.2 }}>
            {line.name}
          </span>
          {line.have ? (
            <span style={{ padding: '3px 8px', borderRadius: 99, background: C.greenSoft, color: C.greenDk, fontSize: 10.5, fontWeight: 700, whiteSpace: 'nowrap' }}>
              you have this
            </span>
          ) : line.held ? (
            <span style={{ padding: '3px 8px', borderRadius: 99, background: AMBER_SOFT, color: AMBER_DK, fontSize: 10.5, fontWeight: 700, whiteSpace: 'nowrap' }}>
              not yet
            </span>
          ) : (
            <span style={{ fontSize: 13, fontWeight: 600, color: C.ink, whiteSpace: 'nowrap' }}>{priceLabel(line)}</span>
          )}
        </div>
        <div style={{ fontSize: 12.5, color: C.mute, lineHeight: 1.5 }}>{line.role}</div>
        {/* WHY THIS LINE EXISTS (the why-layer): the fact that put it here, said to the owner.
            Suppressed on held/have lines, whose own explanations already carry the card. */}
        {line.why && !line.held && !line.have && (
          <div style={{ marginTop: 6, fontSize: 12, fontWeight: 600, color: DESK.mintDeep, lineHeight: 1.45 }}>
            {line.why}
          </div>
        )}
        {line.held && (
          <div style={{ marginTop: 9, paddingTop: 9, borderTop: `0.5px solid ${C.line}`, fontSize: 12, color: AMBER_DK, lineHeight: 1.5 }}>
            {line.held}
          </div>
        )}
        {line.have && (
          <div style={{ marginTop: 9, paddingTop: 9, borderTop: `0.5px solid ${C.line}`, fontSize: 12, color: C.faint, lineHeight: 1.5 }}>
            You told us this is sorted, so it is in the plan but you are not charged for it.
          </div>
        )}
      </div>
      {action && onToggle && (
        <button
          type="button" onClick={onToggle} data-toggle={line.id}
          aria-label={(action === 'add' ? 'Add ' : 'Remove ') + line.name}
          style={{
            flex: '0 0 auto', width: 30, height: 30, borderRadius: 99,
            border: `1px solid ${action === 'add' ? C.green : C.line}`,
            background: action === 'add' ? C.greenSoft : '#fff',
            color: action === 'add' ? C.greenDk : C.mute,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, marginTop: 1,
          }}
        >
          {action === 'add' ? <Plus size={16} /> : <Minus size={16} />}
        </button>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────── the flow ── */

export default function MonthlyPlanFlow({
  inputs,
  signals,
  initialPhase = 'setup',
  initialAnswers,
  initialStep = null,
  initialEdits,
}: {
  /** Everything we already know. Read server-side by getPlanInputs so the form asks almost nothing. */
  inputs: PlanInputs
  /** The brain's flattened read of THIS business, fetched once server-side. Absent on thin data
   *  (the safe route) and the composer behaves exactly as it did before signals existed. */
  signals?: MonthlySignals
  initialPhase?: 'setup' | 'build'
  initialAnswers?: Answers
  initialStep?: string | null
  initialEdits?: { off?: string[]; added?: string[] }
}) {
  const [phase, setPhase] = useState<'setup' | 'build'>(initialPhase)
  const [a, setA] = useState<Answers>(initialAnswers ?? {})
  const [openStep, setOpenStep] = useState<string | null>(initialStep)
  const [off, setOff] = useState<Set<string>>(new Set(initialEdits?.off ?? []))
  const [added, setAdded] = useState<Set<string>>(new Set(initialEdits?.added ?? []))
  const [starting, setStarting] = useState(false)
  const [startErr, setStartErr] = useState<string | null>(null)
  const [accepted, setAccepted] = useState(false)

  /*
   * NOTHING IS SIZED TO A BUDGET UNTIL EVERY QUESTION IS ANSWERED.
   *
   * The dial used to sit in the middle of intake, which had it backwards twice over. It quoted a
   * price from half the answers — the figure visibly moved once the owner reached the reach question
   * two screens later — and it made the money a question rather than a result. The builder's whole
   * claim is that it works out the best plan from what you told it; a budget box in the middle of
   * the form quietly turns that into "tell us your ceiling and we will fill it".
   *
   * So: intake collects, the plan gets built at the size it should be, and the money appears here,
   * on the plan, where there is something to attach it to.
   */
  const goals = a.goals?.length ? a.goals : undefined
  /* A named slow stretch is a WHEN, not a goal — it layers the night work on top of whatever was
   * picked rather than replacing one of the three picks. */
  const hasShift = (a.shift?.length ?? 0) > 0
  /* What the owner already has is never bought again. assetsCover feeds the `have` path, which
   * already renders a covered line at zero and excludes it from both numbers. */
  const have = useMemo(() => assetsCover(a.assets), [a.assets?.join(',')])
  /* A dated campaign (an opening, an event) is one-time work: its dial is the LAUNCH TOTAL and
   * its depth is the goal's own priority ladder. An ongoing plan keeps the monthly dial. */
  const isDated = a.shape === 'date' || a.shape === 'run'
  /* The dial anchors compose with the SAME signals as the live plan — anchors that composed
   * without them could name a floor the actual plan can never hit. signals is server-constant,
   * so the dep is just the prop reference. */
  const anchors = useMemo(
    () => (isDated ? datedAnchors(goals, a.reach, hasShift, a.avoid, a.assets, signals) : null),
    [isDated, goals?.join(','), a.reach, hasShift, a.avoid?.join(','), a.assets?.join(','), signals],
  )
  const suggested = useMemo(
    () => (anchors ? anchors.recommended : recommendedMonthly(goals, a.reach, hasShift, signals)),
    [anchors, goals?.join(','), a.reach, hasShift, signals],
  )
  const floor = useMemo(
    () => (anchors ? anchors.floor : monthlyFloor(goals, a.reach, hasShift, signals)),
    [anchors, goals?.join(','), a.reach, hasShift, signals],
  )
  const ceiling = useMemo(
    () => (anchors ? anchors.ceiling : budgetCeiling(goals, a.reach, hasShift, signals)),
    [anchors, goals?.join(','), a.reach, hasShift, signals],
  )
  /* `a.budget` now means "a number the owner deliberately gave" — typed into intake's optional
   * last question, or set by moving this dial. Given one, the plan OPENS already sized to it,
   * clamped to the honest rails; below the floor or past the ceiling we say so out loud instead
   * of silently billing something else. No number → the dial opens on the recommendation.
   * (Onboarding's stored budget still never anchors anything.) */
  const rawBudget = a.budget
  const budget = rawBudget != null
    ? Math.min(Math.max(rawBudget, floor), ceiling ?? Math.max(rawBudget, floor))
    : suggested
  const stops = useMemo(() => {
    const top = ceiling ?? suggested
    /* The owner's own number is always a real stop, so the thumb sits exactly where they set it. */
    return [...new Set([floor, suggested, budget, ...DIAL_STOPS.filter((v) => v > floor && v < top), top])].sort((x, y) => x - y)
  }, [floor, suggested, ceiling, budget])

  const plan = useMemo(
    () => composeMonthlyPlan(budget, have, { off, added }, goals, a.reach, hasShift, a.avoid, a.assets, signals, { dated: isDated }),
    [budget, have, off, added, goals?.join(','), a.reach, hasShift, a.avoid?.join(','), a.assets?.join(','), signals, isDated],
  )
  const bill = plan.quote
  const state = chainStateOf(MONTHLY_STEPS, plan.lines as never)
  const verdict = chainVerdict(MONTHLY_STEPS, plan.lines as never)
  const backstage = plan.lines.filter((l) => l.stage === 'backstage')
  const edited = off.size > 0 || added.size > 0

  const flip = (set: Set<string>, apply: (s: Set<string>) => void) => (id: string) => {
    const next = new Set(set)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    apply(next)
  }
  const toggleOff = flip(off, setOff)
  const toggleAdded = flip(added, setAdded)

  const body: React.CSSProperties = {
    ...paperGround, minHeight: '100%', padding: '16px 14px 28px',
    fontFamily: "'Inter',system-ui,sans-serif", boxSizing: 'border-box',
  }
  // Remounts the seal after a failed start so it can be pressed again.
  const [attempt, setAttempt] = useState(0)

  /* ── 1. setup: show what we know, ask only the gaps ───────────────────────────────── */
  if (phase === 'setup') {
    return (
      <PlanSetup
        inputs={inputs}
        signals={signals}
        /* The LIVE answers, not the mount-time prop: coming back from the plan ("What we based
         * this on", or the assumed-defaults Change) must reopen the walk with everything already
         * answered, not a blank sheet. On first mount `a` IS the initial prop. */
        initialAnswers={a}
        onBuild={(ans) => {
          setA(ans)
          setPhase('build')
        }}
      />
    )
  }

  /* ── 2b. inside a step ─────────────────────────────────────────────────────────────── */
  const step = MONTHLY_STEPS.find((s) => s.stage === openStep)
  if (step) {
    const mine = plan.lines.filter((l) => l.stage === step.stage)
    const live = mine.filter((l) => !l.held)
    const held = mine.filter((l) => l.held)
    const more = addablesForStep(step.stage as MonthlyStepKey, plan.lines)

    return (
      <div style={body}>
        <DeskKeyframes />
        <Back onClick={() => setOpenStep(null)} label="The plan" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span style={{
            width: 26, height: 26, borderRadius: 8,
            background: live.length ? DESK.ink : '#E9E5DA', color: live.length ? DESK.paper : C.faint,
            fontFamily: DISPLAY, fontSize: 12.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {step.n}
          </span>
          <h2 style={{ fontFamily: DISPLAY, fontSize: 21, fontWeight: 600, color: C.ink, margin: 0, lineHeight: 1.15 }}>
            {step.name}
          </h2>
        </div>
        <p style={{ fontSize: 13, color: C.mute, lineHeight: 1.5, margin: '0 0 6px' }}>{step.does}</p>

        {live.length === 0 && (
          <div style={{ background: AMBER_SOFT, borderRadius: 14, padding: '13px 14px', margin: '12px 0 4px' }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: AMBER_DK, marginBottom: 3 }}>Nothing here yet</div>
            <div style={{ fontSize: 12.5, color: AMBER_DK, lineHeight: 1.5, opacity: 0.9 }}>{step.breaks}</div>
          </div>
        )}

        {live.length > 0 && <SectionLabel>In your plan</SectionLabel>}
        {live.map((l) => (
          <ServiceCard key={l.id} line={l} action="remove" onToggle={() => (l.extra ? toggleAdded(l.id) : toggleOff(l.id))} />
        ))}

        {more.length > 0 && (
          <>
            <SectionLabel>Add more to this step</SectionLabel>
            {more.map((l) => (
              <ServiceCard
                key={l.id} line={l} action={l.held ? null : 'add'}
                onToggle={l.held ? undefined : () => (off.has(l.id) ? toggleOff(l.id) : toggleAdded(l.id))}
              />
            ))}
          </>
        )}

        {held.length > 0 && (
          <>
            <SectionLabel>Not yet, and not billed</SectionLabel>
            {held.map((l) => <ServiceCard key={l.id} line={l} action={null} />)}
          </>
        )}
      </div>
    )
  }

  /* ── 2a. the plan ──────────────────────────────────────────────────────────────────── */
  return (
    <div style={body}>
      <Back onClick={() => setPhase('setup')} label="What we based this on" />

      <div style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 600, color: C.ink, lineHeight: 1.15 }}>
        {a.shape === 'date' ? 'Your plan for the day' : a.shape === 'run' ? 'Your plan for the run' : 'Your monthly plan'}
      </div>
      <div style={{ fontSize: 13, color: C.mute, marginTop: 5, lineHeight: 1.45 }}>
        {a.shape === 'date' || a.shape === 'run'
          ? `Built backwards from ${a.when ? new Date(a.when + 'T12:00:00').toLocaleDateString(undefined, { month: 'long', day: 'numeric' }) : 'your date'}.`
          : 'Runs every month.'}{' '}
        {edited ? 'Changed by you.' : 'Every step covered, nothing padded on top.'}
      </div>

      {/* TIER-4 DEFAULTS, OUT LOUD (Ledger law: a default is never silent). Anything the plan
          assumed rather than was told renders here, with the one-tap way back to change it —
          the tap reopens exactly those questions in the walk. */}
      {(() => {
        const defaulted = ledgerFor(inputs, signals, a).filter((f) => f.tier === 'defaulted')
        if (!defaulted.length) return null
        const SAY: Record<string, string> = { reach: 'the neighbourhood reach', start: 'starting as soon as you approve' }
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 9 }}>
            <span style={{ fontSize: 12.5, color: C.mute, lineHeight: 1.45 }}>
              We assumed {defaulted.map((f) => SAY[f.key] ?? f.label.toLowerCase()).join(' and ')}.
            </span>
            <button
              type="button"
              onClick={() => {
                /* Reopen the defaulted questions: appending them to `asked` puts them back in the
                 * walk (gapsFor honours the model's list plus these), and setup opens on them. */
                const qs = defaulted.map((f) => f.key).filter((k): k is PlanQuestion => k === 'reach')
                const asked = a.asked ?? []
                setA({ ...a, asked: [...asked, ...qs.filter((q) => !asked.some((x) => x.q === q)).map((q) => ({ q, why: 'You asked to change this.' }))] })
                setPhase('setup')
              }}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, color: DESK.mintDeep, fontFamily: "'Inter',system-ui,sans-serif", flexShrink: 0 }}
            >
              Change
            </button>
          </div>
        )
      })()}

      <style>{MP_CSS}</style>
      <DeskKeyframes />
      {/* The only place money is mentioned in the whole flow — and it is a receipt. */}
      <ReceiptFrame style={{ margin: '16px 0 20px' }}>
        <div style={{ display: 'flex', margin: '0 -4px' }}>
          <div style={{ flex: 1, padding: '2px 4px 10px' }}>
            <div style={{ fontFamily: DESK.mono, fontSize: 10, color: DESK.mute, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 5 }}>To start</div>
            <div style={{ fontFamily: DISPLAY, fontSize: 27, fontWeight: 600, color: DESK.ink, lineHeight: 1 }}>{usd(bill.start)}</div>
          </div>
          <div style={{ width: 1, borderLeft: `1.5px dashed ${DESK.line}` }} />
          <div style={{ flex: 1, padding: '2px 4px 10px 14px' }}>
            <div style={{ fontFamily: DESK.mono, fontSize: 10, color: DESK.mute, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 5 }}>Then a month</div>
            <div style={{ fontFamily: DISPLAY, fontSize: 27, fontWeight: 600, color: DESK.mintDeep, lineHeight: 1 }}>{usd(bill.monthly)}</div>
          </div>
        </div>
        <ReceiptRule />
        <div style={{ padding: '2px 0 0' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12.5, color: C.mute }}>{isDated ? 'Want a bigger or smaller launch?' : 'Want more or less each month?'}</span>
            {budget !== suggested && (
              <button
                type="button" onClick={() => setA({ ...a, budget: undefined })}
                style={{ background: 'none', border: 'none', padding: 0, fontSize: 12, color: C.green, fontWeight: 500, cursor: 'pointer' }}
              >
                Back to suggested
              </button>
            )}
          </div>
          <input
            type="range" min={0} max={stops.length - 1} step={1}
            value={Math.max(0, stops.indexOf(budget))}
            onChange={(e) => setA({ ...a, budget: stops[Number(e.target.value)] })}
            className="mp-slider" aria-label={isDated ? 'Total for the launch' : 'Ongoing work each month'}
            style={{ marginTop: 6, ['--mp-track' as string]: `linear-gradient(90deg, ${C.green} ${(Math.max(0, stops.indexOf(budget)) / Math.max(1, stops.length - 1)) * 100}%, #e9e9ee ${(Math.max(0, stops.indexOf(budget)) / Math.max(1, stops.length - 1)) * 100}%)` }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: C.faint, marginTop: -2 }}>
            <span>${floor.toLocaleString('en-US')}</span>
            <span>${(ceiling ?? suggested).toLocaleString('en-US')}</span>
          </div>
          {/* Their number was outside the honest rails: say where we set it and why, out loud. */}
          {rawBudget != null && rawBudget !== budget && (
            <div style={{ marginTop: 9, padding: '9px 11px', background: AMBER_SOFT, borderRadius: 10, fontSize: 12, color: AMBER_DK, lineHeight: 1.5 }}>
              You said about {usd(rawBudget)}. {rawBudget < floor
                ? `The smallest plan that covers every step is ${usd(floor)}, so we set it there. Take pieces out below to go lower.`
                : `Past ${usd(budget)} the extra would go unspent, so we set it there.`}
            </div>
          )}
          {/* Money that is not ours. Shown next to the fee, never folded into it. */}
          {bill.passThroughMonthly > 0 && (
            <div style={{ marginTop: 10, padding: '9px 11px', background: C.bg, borderRadius: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 12.5, color: C.ink, fontWeight: 600 }}>Plus ad spend</span>
                <span style={{ fontSize: 13.5, color: C.ink, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                  {usd(bill.passThroughMonthly)}+/mo
                </span>
              </div>
              <div style={{ fontSize: 11.5, color: C.mute, lineHeight: 1.45, marginTop: 3 }}>
                Paid straight to Google and Meta from your card. We never mark it up and never touch it.
              </div>
            </div>
          )}
          <div style={{ fontSize: 12.5, color: bill.nothingRecurs && !isDated ? AMBER_DK : C.mute, lineHeight: 1.45, marginTop: 7 }}>
            {isDated
              ? budget <= floor
                ? 'The smallest launch that still covers every step. It works, but the day itself gets no extra push.'
                : ceiling && budget >= ceiling
                  ? 'Everything we can genuinely throw at this date. We do not go higher, because the extra would go unspent.'
                  : budget === suggested
                    ? 'The launch we would run for this date: the press push, the creator visit, and the countdown, on top of the foundations.'
                    : 'One-time work for the moment. Anything monthly stops when you pause it.'
              : bill.nothingRecurs
                ? 'Nothing keeps running at this level. We would set you up and then stop, which is not worth your money.'
                : budget <= floor
                  ? 'The smallest amount that keeps anything running. Below it we could set you up and then nothing would happen.'
                  : ceiling && budget >= ceiling
                    ? 'That is everything we can genuinely run for you today. We do not go higher, because the extra would go unspent.'
                    : budget === suggested
                      ? 'What we built you: the smallest plan that covers every step. Run it, see what it does, then move this with real numbers in front of you.'
                      : 'The setup is one-time work you keep. Pause any time and the monthly part stops.'}
          </div>
        </div>
      </ReceiptFrame>

      <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: C.faint, padding: '0 2px 12px' }}>
        What happens to someone who has never heard of you
      </div>

      <div style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, padding: '16px 15px 14px' }}>
        {state.map((s, i) => (
          <ChainRung
            key={s.step.stage} state={s} last={i === state.length - 1}
            nextEmpty={!!state[i + 1]?.empty} onOpen={() => setOpenStep(s.step.stage)} dim={false}
          />
        ))}
      </div>

      <div style={{ fontSize: 12, color: C.faint, lineHeight: 1.5, padding: '11px 4px 0' }}>
        Tap any step to take things out or add more.
      </div>

      {verdict && (
        <div style={{ marginTop: 12, background: AMBER_SOFT, borderRadius: 14, padding: '13px 14px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <Clock size={16} style={{ color: AMBER_DK, flex: '0 0 auto', marginTop: 1 }} />
          <div style={{ fontSize: 12.5, color: AMBER_DK, lineHeight: 1.5 }}>
            <b>Where this plan stops working.</b> {verdict}
          </div>
        </div>
      )}

      {plan.nextUp && (
        <div style={{ marginTop: 12, background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 14, padding: '13px 14px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <TrendingUp size={16} style={{ color: C.greenDk, flex: '0 0 auto', marginTop: 1 }} />
          <div style={{ fontSize: 12.5, color: C.mute, lineHeight: 1.5 }}>
            <b style={{ color: C.ink }}>{usd(plan.nextUp.addlMonthly)} more {isDated ? 'in the launch budget' : 'a month'}</b> would add {plan.nextUp.name}, the next
            most useful thing your budget did not reach.
          </div>
        </div>
      )}

      {backstage.length > 0 && (
        <>
          <SectionLabel>Also included, behind the scenes</SectionLabel>
          <div style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, padding: '13px 14px' }}>
            <div style={{ fontSize: 13, color: C.ink, fontWeight: 600, marginBottom: 4 }}>
              {backstage.map((l) => l.name).join(' + ')}
            </div>
            <div style={{ fontSize: 12, color: C.mute, lineHeight: 1.5 }}>
              Nobody outside sees these. They are how we can tell you later whether any of the rest worked.
            </div>
          </div>
        </>
      )}

      {/* Where this goes next. Shown BEFORE the button on purpose: an owner about to commit money
          should be able to see the approval gate and the results page without taking the leap
          first. Both are real screens that already exist, not promises. */}
      <SectionLabel>What happens after you start</SectionLabel>
      <div style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, overflow: 'hidden' }}>
        {[
          { icon: <Hammer size={16} />, t: 'We get to work', s: 'You do nothing. The setup starts and the first pieces get made.' },
          { icon: <Inbox size={16} />, t: 'Nothing goes out until you say yes', s: 'Every post lands in your Inbox first. Approve it, or ask for changes.', href: '/dashboard/inbox' },
          { icon: <BarChart3 size={16} />, t: 'You see what it did', s: 'Results build up on the plan itself. Where we have no real number yet, it says so.' },
        ].map((r, i) => (
          <div key={r.t}>
            {i > 0 && <div style={{ height: '0.5px', background: C.line, marginLeft: 52 }} />}
            <div style={{ display: 'flex', gap: 13, alignItems: 'flex-start', padding: '13px 14px' }}>
              <span style={{ flex: '0 0 auto', width: 30, height: 30, borderRadius: 9, background: C.greenSoft, color: C.greenDk, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {r.icon}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.ink, lineHeight: 1.3 }}>{r.t}</div>
                <div style={{ fontSize: 12.5, color: C.mute, lineHeight: 1.5, marginTop: 2 }}>{r.s}</div>
                {r.href && (
                  <a href={r.href} style={{ fontSize: 12.5, fontWeight: 700, color: C.greenDk, textDecoration: 'none', display: 'inline-block', marginTop: 5 }}>
                    See your Inbox
                  </a>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {startErr && (
        <div style={{ marginTop: 12, background: '#fdeeee', color: '#c0564f', borderRadius: 12, padding: '11px 13px', fontSize: 12.5, lineHeight: 1.5 }}>
          {startErr} Nothing was charged and nothing was started.
        </div>
      )}

      {/* The terms, before the button rather than after the money. One line of substance plus the
          full text, and the button does not work until it is ticked. */}
      <label
        style={{
          display: 'flex', gap: 11, alignItems: 'flex-start', marginTop: 18, cursor: 'pointer',
          background: '#fff', border: `0.5px solid ${accepted ? C.green : C.line}`,
          borderRadius: 14, padding: '13px 14px',
        }}
      >
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          style={{ width: 20, height: 20, accentColor: C.green, flex: '0 0 auto', marginTop: 1 }}
        />
        <span style={{ fontSize: 12.5, color: C.mute, lineHeight: 1.5 }}>
          {CLIENT_AGREEMENT_SUMMARY}{' '}
          <a href="/client-agreement" target="_blank" rel="noreferrer" style={{ color: C.greenDk, fontWeight: 700 }}>
            Read the full terms
          </a>
        </span>
      </label>

      {/* A plain confirm tap (the hold-to-approve seal is retired). Disabled until the
          terms above are ticked; a failed start remounts it so it can be tapped again. */}
      <div style={{ textAlign: 'center' }}>
      <ConfirmButton
        key={attempt}
        label={starting ? 'Starting...' : 'Confirm and start'}
        disabled={starting || !accepted}
        onClick={async () => {
          setStarting(true)
          setStartErr(null)
          const draft = toCampaignDraft(plan.lines, {
            budgetMonthly: budget,
            goalKey: a.goals?.[0] ?? inputs.goal.value ?? undefined,
            name: 'Monthly marketing plan',
            brief: {
              described: a.described,
              shape: a.shape,
              when: a.when,
              until: a.until,
              start: a.start,
              assets: a.assets,
              promote: a.promote,
              audience: a.audience,
              reach: a.reach,
              shift: a.shift,
              avoid: a.avoid,
              notes: a.notes,
              offerTerms: a.offerTerms,
              offerLimit: a.offerLimit,
              offerExpiry: a.offerExpiry,
              successTarget: a.successTarget,
              capacity: a.capacity,
            },
          })
          const snapshot = buildOrderSnapshot({
            agreementVersion: CLIENT_AGREEMENT_VERSION,
            lines: plan.lines,
            inputs,
            edits: { off, added },
          })
          const res = await startMonthlyPlan(draft, {
            agreementVersion: CLIENT_AGREEMENT_VERSION,
            snapshot: snapshot as unknown as Record<string, unknown>,
          })
          if (res.ok) window.location.href = `/dashboard/campaigns/${res.id}`
          else {
            setStartErr(res.error)
            setStarting(false)
            setAttempt((n) => n + 1)
          }
        }}
      />
      <div style={{ fontSize: 12, color: C.faint, lineHeight: 1.5, marginTop: 2, fontFamily: "'Inter',system-ui,sans-serif" }}>
        {starting ? 'Starting your plan…' : accepted ? 'One tap. This starts the work.' : 'Accept the terms above to start.'}
      </div>
      </div>

      <div style={{ marginTop: 12, display: 'flex', gap: 9, alignItems: 'flex-start', padding: '0 4px', fontSize: 12, color: C.faint, lineHeight: 1.5 }}>
        <Check size={15} style={{ color: C.green, flex: '0 0 auto', marginTop: 1 }} />
        <span>Nothing here guesses how many people will come. Every number is a price or a count of something we make.</span>
      </div>
    </div>
  )
}
