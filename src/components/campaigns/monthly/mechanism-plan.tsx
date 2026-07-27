'use client'

/**
 * mechanism-plan — the plan screen, in the order the owner actually decides.
 *
 * The four-step chain elsewhere draws found -> reason -> easy because that is what happens to a
 * stranger. This screen deliberately does not, because building in journey order is backwards: what
 * the ad says, whether a claim page is needed at all, and how many people must see it are all
 * consequences of the offer. So the offer is first, the mechanic it implies is shown rather than
 * asked, and reach comes last because only then can it be sized instead of guessed.
 *
 * THREE NUMBERS, NOT TWO. Splitting the bill into what we charge, what the owner funds (the prize
 * itself, and platform ad spend at cost) and what the owner does with their own hands is the honest
 * shape. We do not sell the prize, so it cannot sit in our column — but hiding it would repeat the
 * surprise-bill problem the two-number split was built to remove.
 *
 * FREE WORK IS RANKED FIRST INSIDE EACH STAGE. Papering your own window and telling the customers
 * already standing in your other shop will out-perform the ads, and they are exactly the lines an
 * agency leaves off an invoice. Putting them at the top of the stage is the whole posture.
 */

import { useMemo, useState } from 'react'
import { Check, Clock, Ban, ArrowRight, Minus, Plus } from 'lucide-react'
import { C, DISPLAY, AMBER_DK, AMBER_SOFT } from '@/components/mvp/mvp-detail'
import {
  mechanismsFor,
  composeMechanism,
  type Mechanism,
  type MechanismPlan,
  type FreeAction,
} from '@/lib/campaigns/data/mechanisms'
import type { CampaignShape } from '@/lib/campaigns/data/plan-goals'

const usd = (n: number) => '$' + n.toLocaleString('en-US')
const big = (n: number) => (n >= 1000 ? `${Math.round(n / 100) / 10}k` : String(n))

function Stage({ n, title, sub, children }: { n: string; title: string; sub: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 26 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 3 }}>
        <span style={{
          width: 22, height: 22, borderRadius: 7, background: C.ink, color: '#fff',
          fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>{n}</span>
        <span style={{ fontFamily: DISPLAY, fontSize: 18, fontWeight: 600, color: C.ink, letterSpacing: '-0.015em' }}>{title}</span>
      </div>
      <div style={{ fontSize: 12.5, color: C.mute, lineHeight: 1.45, marginBottom: 11, paddingLeft: 31 }}>{sub}</div>
      {children}
    </section>
  )
}

function FreeRow({ a }: { a: FreeAction }) {
  return (
    <div style={{ background: '#f0faf6', borderRadius: 13, padding: '11px 13px', display: 'flex', gap: 9 }}>
      <Check size={14} strokeWidth={2.6} color={C.green} style={{ flexShrink: 0, marginTop: 2 }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 13.5, fontWeight: 640, color: C.ink, lineHeight: 1.25 }}>{a.label}</span>
          <span style={{ fontSize: 11, color: C.green, fontWeight: 650, whiteSpace: 'nowrap' }}>{a.minutes} min · you</span>
        </div>
        <div style={{ fontSize: 11.5, color: C.mute, lineHeight: 1.45, marginTop: 3 }}>{a.why}</div>
        {a.blocks && (
          <div style={{ fontSize: 11.5, color: AMBER_DK, lineHeight: 1.4, marginTop: 4 }}>{a.blocks}.</div>
        )}
      </div>
    </div>
  )
}

function PaidRow({ l }: { l: MechanismPlan['stages']['found'][number] }) {
  return (
    <div style={{
      background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 13, padding: '11px 13px',
      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10,
      opacity: l.held ? 0.7 : 1,
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 620, color: l.held ? C.mute : C.ink, lineHeight: 1.25 }}>{l.name}</div>
        {l.held && (
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <Ban size={12} strokeWidth={2.3} color={AMBER_DK} style={{ flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 11.5, color: AMBER_DK, lineHeight: 1.4 }}>{l.held}</span>
          </div>
        )}
      </div>
      <span style={{ fontSize: 13, fontWeight: 640, color: l.held ? C.faint : C.ink, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
        {l.held ? 'not billed' : usd(l.amount) + (l.kind === 'monthly' ? '/mo' : '')}
      </span>
    </div>
  )
}

export default function MechanismPlan({
  goals,
  shape,
  dailyFootfall,
  onStart,
}: {
  goals: readonly string[]
  shape: CampaignShape
  /** what they told us walks through their existing places. Undefined means we have not asked. */
  dailyFootfall?: number
  onStart?: (p: MechanismPlan) => void
}) {
  const options = useMemo(() => mechanismsFor(goals, shape), [goals.join(','), shape])
  const [chosen, setChosen] = useState<Mechanism>(options[0])
  const [cap, setCap] = useState<number>(options[0]?.cap.suggest ?? 100)

  const plan = useMemo(
    () => composeMechanism(chosen, { cap, dailyFootfall }),
    [chosen, cap, dailyFootfall],
  )
  const r = plan.reach
  const free = (stage: FreeAction['stage']) => plan.freeActions.filter((a) => a.stage === stage)

  const pick = (m: Mechanism) => { setChosen(m); setCap(m.cap.suggest) }
  const step = (d: number) => setCap((c) => Math.max(1, Math.round((c + d * Math.max(1, Math.round(c * 0.1))) / 5) * 5))

  if (!options.length) return null

  return (
    <div style={{ background: C.bg, minHeight: '100%', padding: '16px 14px 28px', fontFamily: "'Inter',system-ui,sans-serif", boxSizing: 'border-box' }}>

      <div style={{ fontFamily: DISPLAY, fontSize: 24, fontWeight: 600, color: C.ink, lineHeight: 1.12, letterSpacing: '-0.015em' }}>
        What will you give?
      </div>
      <div style={{ fontSize: 13, color: C.mute, marginTop: 5, lineHeight: 1.45 }}>
        Start here, because everything else follows from it. The rule decides what the ads say, whether you need a signup page, and how many people have to see it.
      </div>

      {/* ── the rule ─────────────────────────────────────────────────────────── */}
      <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 9 }}>
        {options.map((m) => {
          const on = m.id === chosen.id
          const need = composeMechanism(m, { cap: m.cap.suggest }).reach
          return (
            <button
              key={m.id} type="button" onClick={() => pick(m)}
              style={{
                textAlign: 'left', cursor: 'pointer', width: '100%',
                border: `1.5px solid ${on ? C.green : C.line}`, background: on ? '#f0faf6' : '#fff',
                borderRadius: 18, padding: '14px 15px', fontFamily: "'Inter',system-ui,sans-serif",
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 9 }}>
                <span style={{ fontSize: 15, fontWeight: 660, color: on ? C.green : C.ink, letterSpacing: '-0.012em' }}>{m.name}</span>
                {on && <Check size={15} strokeWidth={3} color={C.green} style={{ flexShrink: 0 }} />}
              </div>
              <div style={{ fontSize: 12.5, color: C.ink, lineHeight: 1.5, marginTop: 5 }}>
                &ldquo;{m.rule.replace('{cap}', String(m.cap.suggest))}&rdquo;
              </div>
              <div style={{ fontSize: 12, color: C.mute, lineHeight: 1.45, marginTop: 5 }}>{m.bet}</div>
              {/* The number that should decide this, and that could not exist before the cap did. */}
              <div style={{ fontSize: 11.5, color: C.faint, marginTop: 7, paddingTop: 7, borderTop: `0.5px solid ${C.line}` }}>
                needs about <b style={{ color: C.ink, fontWeight: 640 }}>{big(need.seenNeeded)} people</b> to see it
              </div>
            </button>
          )
        })}
      </div>

      {/* ── the cap ──────────────────────────────────────────────────────────── */}
      <div style={{ marginTop: 12, background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 18, padding: '14px 15px' }}>
        <div style={{ fontSize: 13.5, fontWeight: 640, color: C.ink }}>{chosen.cap.label}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 9 }}>
          <button type="button" onClick={() => step(-1)} aria-label="Fewer"
            style={{ width: 38, height: 38, borderRadius: 12, border: `1px solid ${C.line}`, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Minus size={16} strokeWidth={2.4} color={C.ink} />
          </button>
          <span style={{ fontFamily: DISPLAY, fontSize: 30, fontWeight: 600, color: C.ink, minWidth: 66, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{cap}</span>
          <button type="button" onClick={() => step(1)} aria-label="More"
            style={{ width: 38, height: 38, borderRadius: 12, border: `1px solid ${C.line}`, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Plus size={16} strokeWidth={2.4} color={C.ink} />
          </button>
        </div>
        <div style={{ fontSize: 12, color: C.mute, lineHeight: 1.5, marginTop: 10, paddingTop: 10, borderTop: `0.5px solid ${C.line}` }}>
          {chosen.costModel}
        </div>
      </div>

      {/* ── ② what it takes to say yes ───────────────────────────────────────── */}
      <Stage n="2" title="How they take it up" sub="Decided by the rule, not by you. This is what has to exist for someone to say yes.">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {plan.stages.easy.map((l) => <PaidRow key={l.id} l={l} />)}
          {free('easy').map((a) => <FreeRow key={a.id} a={a} />)}
        </div>
      </Stage>

      {/* ── ③ reach, sized ───────────────────────────────────────────────────── */}
      <Stage n="3" title="How they find out" sub="Sized from your number, not guessed.">
        <div style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 18, padding: '15px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            {[[cap, 'collected'], [r.actsNeeded, 'act on it'], [big(r.seenNeeded), 'see it']].map(([v, k], i) => (
              <div key={k as string} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {i > 0 && <ArrowRight size={13} strokeWidth={2.4} color={C.faint} style={{ transform: 'rotate(180deg)' }} />}
                <div>
                  <div style={{ fontFamily: DISPLAY, fontSize: 20, fontWeight: 600, color: C.ink, lineHeight: 1 }}>{v}</div>
                  <div style={{ fontSize: 11, color: C.mute, marginTop: 2 }}>{k}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11.5, color: C.mute, lineHeight: 1.5, marginTop: 11, paddingTop: 10, borderTop: `0.5px solid ${C.line}` }}>
            Assuming <b style={{ color: C.ink }}>{(r.assumptions.actRate * 100).toFixed(1)}%</b> act and{' '}
            <b style={{ color: C.ink }}>{Math.round(r.assumptions.showRate * 100)}%</b> of those follow through. {r.assumptions.basis} If you know your own numbers, tell us and this resizes.
          </div>

          {/* The counterweight to selling reach they already have. */}
          {r.ownReach == null ? (
            <div style={{ fontSize: 12, color: AMBER_DK, background: AMBER_SOFT, borderRadius: 11, padding: '9px 11px', marginTop: 10, lineHeight: 1.45 }}>
              We have not asked how many people pass your places each day. Tell us and we can work out how much of this you already reach for nothing.
            </div>
          ) : r.gap === 0 ? (
            <div style={{ fontSize: 12.5, color: C.green, background: '#f0faf6', borderRadius: 11, padding: '10px 12px', marginTop: 10, lineHeight: 1.45, fontWeight: 600 }}>
              Your own window and counter already reach about {big(r.ownReach)} people. That covers it. You do not need to buy reach for this.
            </div>
          ) : (
            <div style={{ fontSize: 12, color: C.ink, background: C.bg, borderRadius: 11, padding: '10px 12px', marginTop: 10, lineHeight: 1.5 }}>
              Your window and counter reach about <b>{big(r.ownReach)}</b> of that for free. About <b>{big(r.gap!)}</b> left to cover.
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
          {free('found').map((a) => <FreeRow key={a.id} a={a} />)}
          {plan.stages.found.map((l) => <PaidRow key={l.id} l={l} />)}
        </div>
      </Stage>

      {/* ── what it makes ────────────────────────────────────────────────────── */}
      <Stage n="4" title="What you get for it" sub="What is worth showing people, once they are looking.">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {plan.stages.reason.map((l) => <PaidRow key={l.id} l={l} />)}
          {free('reason').map((a) => <FreeRow key={a.id} a={a} />)}
        </div>
      </Stage>

      {/* ── three numbers ────────────────────────────────────────────────────── */}
      <div style={{ marginTop: 26, background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 18, overflow: 'hidden' }}>
        <div style={{ padding: '15px 16px 13px' }}>
          <div style={{ fontSize: 11, color: C.faint, letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 5 }}>What we bill</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
            <span style={{ fontFamily: DISPLAY, fontSize: 27, fontWeight: 600, color: C.ink, lineHeight: 1 }}>{usd(plan.bill.start)}</span>
            <span style={{ fontSize: 13, color: C.mute }}>to start</span>
            {plan.bill.monthly > 0 && (
              <span style={{ fontSize: 14, color: C.green, fontWeight: 640 }}>+ {usd(plan.bill.monthly)}/mo</span>
            )}
          </div>
        </div>
        <div style={{ padding: '13px 16px', borderTop: `0.5px solid ${C.line}`, background: C.bg }}>
          <div style={{ fontSize: 11, color: C.faint, letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 5 }}>What you fund</div>
          <div style={{ fontSize: 12.5, color: C.ink, lineHeight: 1.5 }}>
            The {chosen.cap.label.toLowerCase().replace(/[?]/g, '')} themselves. {chosen.costModel}
          </div>
          {plan.bill.passThroughMonthly > 0 && (
            <div style={{ fontSize: 12.5, color: C.ink, lineHeight: 1.5, marginTop: 6 }}>
              Plus about <b>{usd(plan.bill.passThroughMonthly)}/mo</b> of ad spend, paid straight to Google and Meta. We never mark it up.
            </div>
          )}
        </div>
        <div style={{ padding: '13px 16px', borderTop: `0.5px solid ${C.line}` }}>
          <div style={{ fontSize: 11, color: C.faint, letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 5 }}>What you do</div>
          <div style={{ fontSize: 12.5, color: C.ink, lineHeight: 1.5 }}>
            <b>{plan.yourMinutes} minutes</b> across {plan.freeActions.length} steps we do not sell. They are the strongest things on this page.
          </div>
        </div>
      </div>

      {/* ── how you will know ────────────────────────────────────────────────── */}
      <div style={{
        marginTop: 12, borderRadius: 18, padding: '15px 16px',
        background: chosen.leading ? '#f0faf6' : AMBER_SOFT,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
          <Clock size={14} strokeWidth={2.3} color={chosen.leading ? C.green : AMBER_DK} />
          <span style={{ fontSize: 13.5, fontWeight: 660, color: chosen.leading ? C.ink : AMBER_DK }}>
            {chosen.leading ? 'How you will know early' : 'You will not know until the day'}
          </span>
        </div>
        {chosen.leading ? (
          <div style={{ fontSize: 12.5, color: C.ink, lineHeight: 1.5 }}>
            Watch <b>{chosen.leading.label.toLowerCase()}</b>, {chosen.leading.when}. {chosen.leading.healthy}
            <div style={{ color: C.mute, marginTop: 5 }}>On the day itself we count {chosen.count.label.toLowerCase()}.</div>
          </div>
        ) : (
          <div style={{ fontSize: 12.5, color: AMBER_DK, lineHeight: 1.5 }}>
            This rule has nothing to watch beforehand. If it is going to fall short you find out on the morning, with nothing left to change. A rule with a signup step gives you three weeks of warning.
          </div>
        )}
      </div>

      {/* ── what it costs you beyond money ───────────────────────────────────── */}
      <div style={{ marginTop: 12, padding: '0 2px' }}>
        <div style={{ fontSize: 11, color: C.faint, letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 7 }}>What it costs you</div>
        {chosen.risks.map((x) => (
          <div key={x} style={{ fontSize: 12.5, color: C.mute, lineHeight: 1.55, marginBottom: 4 }}>{x}</div>
        ))}
      </div>

      <button
        type="button" onClick={() => onStart?.(plan)}
        style={{
          width: '100%', height: 52, marginTop: 20, borderRadius: 26, border: 'none', background: C.green, color: '#fff',
          fontFamily: DISPLAY, fontSize: 16, fontWeight: 600, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}
      >
        Start this campaign <ArrowRight size={17} strokeWidth={2.6} />
      </button>
      <div style={{ fontSize: 11.5, color: C.faint, textAlign: 'center', marginTop: 9, lineHeight: 1.45 }}>
        You approve everything before it goes out. The monthly part stops whenever you say.
      </div>
    </div>
  )
}
