'use client'

/**
 * Fill your slow nights, in two moves: ask, then build.
 *
 *   1 ASK    four questions, because a plan built without a budget, a night and a date is a guess
 *            wearing a price tag.
 *   2 BUILD  we compose the best plan the budget actually affords, then hand it over as something
 *            the owner can work in: four steps, tap one open, take things out, add things back, and
 *            watch the price and the chain move as you do.
 *
 * There is no three-plan gate. The budget picks the plan; the builder is where the owner disagrees
 * with it. That is strictly more expressive than three buttons, because every service the catalog
 * tags for this goal is reachable one at a time, so the tiers become a continuum instead of a fork.
 */

import { useMemo, useState } from 'react'
import { ChevronLeft, Check, Clock, ArrowRight, Plus, Minus } from 'lucide-react'
import { C, DISPLAY, AMBER_DK, AMBER_SOFT } from '@/components/mvp/mvp-detail'
import { notYetSummary } from '@/lib/campaigns/data/service-availability'
import {
  STEPS,
  buildSlowNightsLines,
  billOf,
  addablesFor,
  priceLabel,
  usd,
  type PlanLine,
  type Step,
} from './slow-nights-data'
import { ChainRung, chainStateOf, chainVerdict } from './slow-nights-chain'

const NIGHTS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Sunday']

const DRAWS = [
  { v: 'a small deal', label: 'A deal', sub: 'Something off, or a bundle' },
  { v: 'a featured dish', label: 'A dish', sub: 'One plate people come for' },
  { v: 'an event', label: 'An event', sub: 'Trivia, music, a theme' },
  { v: 'not sure yet', label: 'Not sure', sub: 'Help me pick one' },
]

/** Budget bands. The number is what the plan is actually fitted against. */
const BUDGETS = [
  { v: 250, label: 'Under $300', sub: 'a month' },
  { v: 600, label: '$300 to $700', sub: 'a month' },
  { v: 1200, label: '$700 to $1,500', sub: 'a month' },
  { v: 2500, label: 'More than $1,500', sub: 'a month' },
]

const TIER_LABEL: Record<string, string> = {
  lean: 'a lean start',
  standard: 'the full plan',
  aggressive: 'an all-in push',
}

type Answers = { night: string; draw: string; start: string; budget: number | null }

function defaultStart() {
  const d = new Date()
  d.setDate(d.getDate() + 21)
  return d.toISOString().slice(0, 10)
}

const prettyDate = (iso: string) => {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

/**
 * The biggest plan whose BILLED monthly fits the budget.
 *
 * NOT compose-plan's fitTierToMonthlyBudget, deliberately. That helper fits against planCostForGoal,
 * which totals the RAW catalog including the lines we hold and never charge for, so it would size
 * the plan off a price the owner is never billed. If the held rails land and nothing is held any
 * more, the two agree again.
 */
function fitTier(spec: (b: string) => Record<string, string>, budget: number | null): string {
  if (!budget) return 'standard'
  const fits = (['aggressive', 'standard', 'lean'] as const).filter(
    (k) => billOf(buildSlowNightsLines(spec(TIER_LABEL[k]))).monthly <= budget,
  )
  if (!fits.length) return 'lean'
  // Prefer the biggest that fits, but break ties DOWNWARD: today aggressive ties with standard on
  // monthly (its extras are all held), so it would cost more up front for nothing ongoing.
  const monthlyOf = (k: string) => billOf(buildSlowNightsLines(spec(TIER_LABEL[k]))).monthly
  const best = Math.max(...fits.map(monthlyOf))
  return [...fits].reverse().find((k) => monthlyOf(k) === best)!
}

/* ────────────────────────────────────────────────────────────────────────── shared bits ── */

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

function Chips({
  options,
  value,
  onPick,
}: {
  options: { v: string | number; label: string; sub?: string }[]
  value: string | number | null
  onPick: (v: never) => void
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {options.map((o) => {
        const on = value === o.v
        return (
          <button
            key={String(o.v)}
            type="button"
            onClick={() => onPick(o.v as never)}
            style={{
              flex: o.sub ? '1 1 46%' : '0 0 auto',
              textAlign: 'left',
              border: `1px solid ${on ? C.green : C.line}`,
              background: on ? C.greenSoft : '#fff',
              borderRadius: 13,
              padding: o.sub ? '11px 13px' : '9px 14px',
              cursor: 'pointer',
              font: 'inherit',
            }}
          >
            <span style={{ display: 'block', fontSize: 14, fontWeight: on ? 700 : 600, color: on ? C.greenDk : C.ink }}>
              {o.label}
            </span>
            {o.sub && <span style={{ display: 'block', fontSize: 11.5, color: C.mute, marginTop: 2 }}>{o.sub}</span>}
          </button>
        )
      })}
    </div>
  )
}

function Back({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        background: 'none',
        border: 'none',
        padding: '0 0 14px',
        color: C.greenDk,
        fontSize: 14.5,
        fontWeight: 600,
        cursor: 'pointer',
        font: 'inherit',
      }}
    >
      <ChevronLeft size={17} />
      {label}
    </button>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11.5,
        fontWeight: 700,
        letterSpacing: '.06em',
        textTransform: 'uppercase',
        color: C.faint,
        padding: '14px 4px 8px',
      }}
    >
      {children}
    </div>
  )
}

/** One service in the builder: what it is, what it does here, what it costs, in or out. */
function ServiceCard({
  line,
  action,
  onToggle,
}: {
  line: PlanLine
  action: 'remove' | 'add' | null
  onToggle?: () => void
}) {
  const held = !!line.held
  return (
    <div
      style={{
        background: '#fff',
        border: `${line.extra ? 1 : 0.5}px solid ${line.extra ? C.green : C.line}`,
        borderRadius: 16,
        padding: '14px 14px 13px',
        marginBottom: 10,
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, marginBottom: 6 }}>
          <span
            style={{
              flex: 1,
              fontFamily: DISPLAY,
              fontSize: 15.5,
              fontWeight: 600,
              color: held ? C.mute : C.ink,
              lineHeight: 1.2,
            }}
          >
            {line.name}
          </span>
          {held ? (
            <span
              style={{
                padding: '3px 8px',
                borderRadius: 99,
                background: AMBER_SOFT,
                color: AMBER_DK,
                fontSize: 10.5,
                fontWeight: 700,
                whiteSpace: 'nowrap',
              }}
            >
              not yet
            </span>
          ) : (
            <span style={{ fontSize: 13, fontWeight: 600, color: C.ink, whiteSpace: 'nowrap' }}>{priceLabel(line)}</span>
          )}
        </div>
        <div style={{ fontSize: 12.5, color: C.mute, lineHeight: 1.5 }}>{line.role}</div>
        {held && (
          <div
            style={{
              marginTop: 9,
              paddingTop: 9,
              borderTop: `0.5px solid ${C.line}`,
              fontSize: 12,
              color: AMBER_DK,
              lineHeight: 1.5,
            }}
          >
            {line.held}
          </div>
        )}
      </div>

      {action && onToggle && (
        <button
          type="button"
          onClick={onToggle}
          aria-label={action === 'add' ? 'Add ' + line.name : 'Remove ' + line.name}
          data-toggle={line.id}
          style={{
            flex: '0 0 auto',
            width: 30,
            height: 30,
            borderRadius: 99,
            border: `1px solid ${action === 'add' ? C.green : C.line}`,
            background: action === 'add' ? C.greenSoft : '#fff',
            color: action === 'add' ? C.greenDk : C.mute,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            marginTop: 1,
          }}
        >
          {action === 'add' ? <Plus size={16} /> : <Minus size={16} />}
        </button>
      )}
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────────── the flow ── */

export default function SlowNightsFlow({
  initialPhase = 'ask',
  initialAnswers,
  initialStep = null,
  initialEdits,
}: {
  /** Start part-way in. Exists so a saved draft can resume, and so a static render can show any
   *  state of a stateful flow without the preview having to fake the component. */
  initialPhase?: 'ask' | 'build'
  initialAnswers?: Partial<Answers>
  initialStep?: string | null
  initialEdits?: { off?: string[]; added?: string[] }
} = {}) {
  const [phase, setPhase] = useState<'ask' | 'build'>(initialPhase)
  const [a, setA] = useState<Answers>({
    night: 'Tuesday',
    draw: '',
    start: defaultStart(),
    budget: null,
    ...initialAnswers,
  })
  const [openStep, setOpenStep] = useState<string | null>(initialStep)
  const [off, setOff] = useState<Set<string>>(new Set(initialEdits?.off ?? []))
  const [added, setAdded] = useState<Set<string>>(new Set(initialEdits?.added ?? []))

  const specFor = (budgetLabel: string): Record<string, string> => ({
    days: a.night,
    offer: a.draw || 'a small deal',
    list: 'reaching your email + text list',
    budget: budgetLabel,
  })

  const tier = useMemo(() => fitTier(specFor, a.budget), [a.night, a.draw, a.budget])
  const lines = useMemo(
    () => buildSlowNightsLines(specFor(TIER_LABEL[tier]), { off, added }),
    [a.night, a.draw, tier, off, added],
  )
  const bill = billOf(lines)
  const state = chainStateOf(STEPS, lines)
  const verdict = chainVerdict(STEPS, lines)
  const heldNote = notYetSummary(lines.map((l) => l.id))
  const edited = off.size > 0 || added.size > 0

  const toggle = (set: Set<string>, apply: (s: Set<string>) => void) => (id: string) => {
    const next = new Set(set)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    apply(next)
  }
  const toggleOff = toggle(off, setOff)
  const toggleAdded = toggle(added, setAdded)

  const body: React.CSSProperties = {
    background: C.bg,
    minHeight: '100%',
    padding: '16px 14px 28px',
    fontFamily: "'Inter',system-ui,sans-serif",
    boxSizing: 'border-box',
  }

  /* ── 1. ask ────────────────────────────────────────────────────────────────────────── */
  if (phase === 'ask') {
    const ready = !!a.night && !!a.draw && !!a.start && a.budget != null
    return (
      <div style={body}>
        <Q n={1} of={4} title="Which night is slow?" sub="Pick the one you most want to fill.">
          <Chips options={NIGHTS.map((n) => ({ v: n, label: n }))} value={a.night} onPick={(v) => setA({ ...a, night: v })} />
        </Q>

        <Q n={2} of={4} title="What brings people in?" sub="The reason someone picks that night over staying home.">
          <Chips options={DRAWS} value={a.draw} onPick={(v) => setA({ ...a, draw: v })} />
        </Q>

        <Q n={3} of={4} title="When do you want it running?" sub="We work back from this to tell you what has to happen when.">
          <input
            type="date"
            className="mvp-input"
            value={a.start}
            onChange={(e) => setA({ ...a, start: e.target.value })}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              height: 46,
              padding: '0 13px',
              fontSize: 16,
              border: `1px solid ${C.line}`,
              borderRadius: 12,
              background: '#fff',
              color: C.ink,
              fontFamily: "'Inter',system-ui,sans-serif",
            }}
          />
        </Q>

        <Q n={4} of={4} title="What can you spend a month?" sub="We build the biggest plan that fits it. You can change anything after.">
          <Chips options={BUDGETS} value={a.budget} onPick={(v) => setA({ ...a, budget: v })} />
        </Q>

        <button
          type="button"
          onClick={() => setPhase('build')}
          disabled={!ready}
          style={{
            width: '100%',
            height: 48,
            borderRadius: 14,
            border: 'none',
            background: ready ? C.green : '#bfe7da',
            color: '#fff',
            fontSize: 16,
            fontWeight: 700,
            cursor: ready ? 'pointer' : 'default',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 7,
            fontFamily: "'Inter',system-ui,sans-serif",
          }}
        >
          {ready ? 'Build my plan' : 'Answer all four'}
          {ready && <ArrowRight size={17} />}
        </button>
      </div>
    )
  }

  /* ── 2b. inside a step: the editable part ──────────────────────────────────────────── */
  const step = STEPS.find((s) => s.stage === openStep) as Step | undefined
  if (step) {
    const mine = lines.filter((l) => l.stage === step.stage)
    const live = mine.filter((l) => !l.held)
    const held = mine.filter((l) => l.held)
    const more = addablesFor(step.stage, lines)

    return (
      <div style={body}>
        <Back onClick={() => setOpenStep(null)} label="The plan" />

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span
            style={{
              width: 26,
              height: 26,
              borderRadius: 99,
              background: live.length ? step.col : '#f0f0f3',
              color: live.length ? '#fff' : C.faint,
              fontSize: 12.5,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
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
                key={l.id}
                line={l}
                action={l.held ? null : 'add'}
                onToggle={l.held ? undefined : () => (off.has(l.id) ? toggleOff(l.id) : toggleAdded(l.id))}
              />
            ))}
          </>
        )}

        {held.length > 0 && (
          <>
            <SectionLabel>Not yet, and not billed</SectionLabel>
            {held.map((l) => (
              <ServiceCard key={l.id} line={l} action={null} />
            ))}
          </>
        )}
      </div>
    )
  }

  /* ── 2a. the builder ───────────────────────────────────────────────────────────────── */
  return (
    <div style={body}>
      <Back onClick={() => setPhase('ask')} label="Change your answers" />

      <div style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 600, color: C.ink, lineHeight: 1.15 }}>
        Your {a.night} plan
      </div>
      <div style={{ fontSize: 13, color: C.mute, marginTop: 5, lineHeight: 1.45 }}>
        Every week from {prettyDate(a.start)}.{' '}
        {edited ? 'Changed by you.' : 'The biggest plan that fits what you said you can spend.'}
      </div>

      <div
        style={{
          background: '#fff',
          border: `0.5px solid ${C.line}`,
          borderRadius: 16,
          padding: '15px 16px 13px',
          margin: '16px 0 20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
          <span style={{ fontFamily: DISPLAY, fontSize: 27, fontWeight: 600, color: C.ink, lineHeight: 1 }}>
            {usd(bill.once)}
          </span>
          <span style={{ fontSize: 13.5, color: C.mute }}>to start</span>
        </div>
        <div style={{ fontSize: 14, color: C.ink, fontWeight: 600, marginTop: 6 }}>
          {usd(bill.monthly)} <span style={{ color: C.mute, fontWeight: 400 }}>a month after that</span>
          {a.budget != null && bill.monthly > a.budget && (
            <span style={{ color: AMBER_DK, fontWeight: 600 }}> · over your budget</span>
          )}
        </div>
        <div
          style={{
            marginTop: 11,
            paddingTop: 11,
            borderTop: `0.5px solid ${C.line}`,
            fontSize: 12.5,
            color: C.mute,
            lineHeight: 1.45,
          }}
        >
          Pause any time and the monthly part stops. What you paid for once stays yours.
        </div>
      </div>

      <div
        style={{
          fontSize: 11.5,
          fontWeight: 700,
          letterSpacing: '.06em',
          textTransform: 'uppercase',
          color: C.faint,
          padding: '0 2px 12px',
        }}
      >
        What happens to someone who has never heard of you
      </div>

      <div style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, padding: '16px 15px 14px' }}>
        {state.map((s, i) => (
          <ChainRung
            key={s.step.stage}
            state={s}
            last={i === state.length - 1}
            nextEmpty={!!state[i + 1]?.empty}
            onOpen={() => setOpenStep(s.step.stage)}
            dim={false}
          />
        ))}
      </div>

      <div style={{ fontSize: 12, color: C.faint, lineHeight: 1.5, padding: '11px 4px 0' }}>
        Tap any step to take things out or add more.
      </div>

      {verdict && (
        <div
          style={{
            marginTop: 12,
            background: AMBER_SOFT,
            borderRadius: 14,
            padding: '13px 14px',
            display: 'flex',
            gap: 10,
            alignItems: 'flex-start',
          }}
        >
          <Clock size={16} style={{ color: AMBER_DK, flex: '0 0 auto', marginTop: 1 }} />
          <div style={{ fontSize: 12.5, color: AMBER_DK, lineHeight: 1.5 }}>
            <b>Where this plan stops working.</b> {verdict}
          </div>
        </div>
      )}

      {heldNote && (
        <div style={{ marginTop: 12, fontSize: 12, color: C.faint, lineHeight: 1.5, padding: '0 4px' }}>
          {heldNote} Those lines are shown inside the steps so you can see the whole shape, and you
          are not charged for them.
        </div>
      )}

      <div
        style={{
          marginTop: 14,
          display: 'flex',
          gap: 9,
          alignItems: 'flex-start',
          padding: '0 4px',
          fontSize: 12,
          color: C.faint,
          lineHeight: 1.5,
        }}
      >
        <Check size={15} style={{ color: C.green, flex: '0 0 auto', marginTop: 1 }} />
        <span>
          Nothing here guesses how many people will come. Every number is a price or a count of
          something we make.
        </span>
      </div>
    </div>
  )
}
